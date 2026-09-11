const vscode = require('vscode');
const https = require('https');
const http = require('http');
const cp = require('child_process');

let myStatusBarItem;
let refreshTimer;
let refreshPromise = null;

// Interval refresh default dan batas minimum (dalam detik)
const DEFAULT_REFRESH_INTERVAL_SEC = 300;
const MIN_REFRESH_INTERVAL_SEC = 30;
const MAX_PORTS_PER_PROCESS = 8;
const MAX_TOTAL_PORT_PROBES = 24;
// Platform detection
const IS_WINDOWS = process.platform === 'win32';
// Extension version dinamis dari package.json
const packageJson = require('./package.json');
const EXT_VERSION = packageJson.version || '1.1.6';

// Format waktu 24 jam (HH:mm:ss) untuk tooltip
function formatTime24(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// Render visual progress bar dengan balok berwarna (hijau, kuning, merah)
function renderColoredProgressBar(fraction, length = 12) {
    const f = Math.max(0, Math.min(1, Number(fraction) || 0));
    const pct = f * 100;
    const filled = Math.round(f * length);
    const empty = length - filled;

    let fillChar = '🟩';
    if (pct < 20) {
        fillChar = '🟥';
    } else if (pct < 50) {
        fillChar = '🟨';
    }

    return `[${fillChar.repeat(filled)}${'⬛'.repeat(empty)}]`;
}

// Format waktu reset / countdown kuota
function formatResetTime(resetTimeIso, fraction) {
    const f = Number(fraction) || 0;
    if (f >= 1.0) {
        return 'Quota available';
    }
    let timeStr = '';
    if (resetTimeIso) {
        try {
            const resetDate = new Date(resetTimeIso);
            if (!isNaN(resetDate.getTime())) {
                const diffMs = resetDate.getTime() - Date.now();
                if (diffMs > 0) {
                    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    if (totalHours > 0) {
                        timeStr = `${totalHours}h ${minutes}m`;
                    } else {
                        timeStr = `${minutes}m`;
                    }
                }
            }
        } catch { /* parse failed; timeStr remains empty */ }
    }

    const pct = Math.round(f * 100);
    if (!timeStr) {
        return f <= 0 ? 'Quota exhausted' : `${pct}% remaining`;
    }
    if (f <= 0) {
        return `Quota exhausted · Refreshes in ${timeStr}`;
    }
    return `${pct}% remaining · Refreshes in ${timeStr}`;
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log(`[open-quota-antigravity v${EXT_VERSION}] Extension activated.`);

    // Buat item status bar untuk menampilkan ringkasan kuota
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    // Klik status bar = refresh otomatis (tanpa popup)
    myStatusBarItem.command = 'open-quota-antigravity.refreshSilent';
    context.subscriptions.push(myStatusBarItem);

    // 1. Perintah refresh manual (dengan notifikasi)
    let refreshCmd = vscode.commands.registerCommand('open-quota-antigravity.refresh', () => {
        refreshOnce({ silent: false });
    });

    // 1b. Perintah refresh tanpa notifikasi (untuk klik status bar)
    let refreshSilentCmd = vscode.commands.registerCommand('open-quota-antigravity.refreshSilent', () => {
        refreshOnce({ silent: true });
    });

    // 2. Perintah tampilkan detail kuota (popup modal)
    let showDetailCmd = vscode.commands.registerCommand('open-quota-antigravity.showDetail', async () => {
        const data = await checkQuotaGuarded();
        updateStatusBar(data);
        if (data) {
            const detailMsg = formatDetailText(data);
            vscode.window.showInformationMessage(detailMsg, { modal: true });
        } else {
            vscode.window.showErrorMessage('Open Quota Antigravity: Could not retrieve details.');
        }
    });

    // 3. Perintah reload (restart polling)
    let reloadCmd = vscode.commands.registerCommand('open-quota-antigravity.reload', async () => {
        if (refreshTimer) clearInterval(refreshTimer);
        myStatusBarItem.text = "$(sync~spin) Reloading...";

        startPolling();
        vscode.window.showInformationMessage('Open Quota Antigravity: Reloaded');
    });

    context.subscriptions.push(refreshCmd);
    context.subscriptions.push(refreshSilentCmd);
    context.subscriptions.push(showDetailCmd);
    context.subscriptions.push(reloadCmd);

    // Mulai polling setelah aktivasi
    startPolling();
}

// Jalankan refresh sekali, opsi silent = tanpa notifikasi
async function refreshOnce(options = {}) {
    const silent = options.silent === true;
    myStatusBarItem.text = "$(sync~spin) Quota...";
    const data = await checkQuotaGuarded();
    updateStatusBar(data);
    if (!silent) {
        if (data) {
            vscode.window.showInformationMessage('Open Quota Antigravity: Refreshed Successfully');
        } else {
            vscode.window.showErrorMessage('Open Quota Antigravity: Failed to fetch quota');
        }
    }
}

function startPolling() {
    // Tampilkan loading state terlebih dahulu agar tidak blank
    myStatusBarItem.text = "$(sync~spin) Quota...";
    myStatusBarItem.show();
    // Update awal agar status bar langsung terisi
    checkQuotaGuarded().then(updateStatusBar);

    const config = vscode.workspace.getConfiguration('openQuotaAntigravity');
    let intervalSec = Number(config.get('refreshInterval'));
    if (!Number.isFinite(intervalSec) || intervalSec <= 0) intervalSec = DEFAULT_REFRESH_INTERVAL_SEC;
    if (intervalSec < MIN_REFRESH_INTERVAL_SEC) intervalSec = MIN_REFRESH_INTERVAL_SEC;
    const interval = intervalSec * 1000;

    // Atur interval polling sesuai konfigurasi pengguna
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        checkQuotaGuarded().then(updateStatusBar);
    }, interval);
}

function deactivate() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
}

function checkQuotaGuarded() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = checkQuota()
        .catch((e) => {
            console.error("Check quota failed:", e);
            return null;
        })
        .finally(() => {
            refreshPromise = null;
        });

    return refreshPromise;
}

// --- Status Bar UI ---

function updateStatusBar(data) {
    if (!data) {
        myStatusBarItem.text = "$(error) Quota Error";
        myStatusBarItem.tooltip = "Could not connect to language server or find process.";
        return;
    }

    try {
        const groups = data.groups || [];
        const models = data.models || [];

        // --- Susun teks ringkas untuk status bar ---
        let statusTextParts = [];

        if (groups.length > 0) {
            // Urutkan grup: Gemini terlebih dahulu, lalu Claude / lainnya
            const sortedGroups = [...groups].sort((a, b) => {
                const aName = (a.displayName || '').toLowerCase();
                const bName = (b.displayName || '').toLowerCase();
                if (aName.includes('gemini') && !bName.includes('gemini')) return -1;
                if (!aName.includes('gemini') && bName.includes('gemini')) return 1;
                return 0;
            });

            sortedGroups.forEach(group => {
                const buckets = group.buckets || [];
                // Prioritaskan 5-hour limit rolling bucket
                const bucket5h = buckets.find(b => b.window === '5h' || (b.bucketId && b.bucketId.includes('5h')));
                const bucketWeekly = buckets.find(b => b.window === 'weekly' || (b.bucketId && b.bucketId.includes('weekly')));

                let targetBucket = bucket5h || buckets[0];
                if (bucketWeekly && bucketWeekly.remainingFraction < 0.2 && (!bucket5h || bucketWeekly.remainingFraction < bucket5h.remainingFraction)) {
                    targetBucket = bucketWeekly;
                }

                if (targetBucket) {
                    const pct = targetBucket.remainingFraction * 100;
                    let shortName = 'Claude';
                    if ((group.displayName || '').toLowerCase().includes('gemini')) {
                        shortName = 'Gemini';
                    }
                    let icon = "🟢";
                    if (pct < 20) icon = "🔴";
                    else if (pct < 50) icon = "🟡";

                    statusTextParts.push(`${icon} ${shortName} ${pct.toFixed(0)}%`);
                }
            });
        }

        // Fallback jika grup belum tersedia: gunakan Smart Grouping dari models
        if (statusTextParts.length === 0 && models.length > 0) {
            const groupMap = new Map();
            models.forEach(m => {
                const label = m.label || '';
                const lower = label.toLowerCase();
                const pct = Number(m.remaining_percent) || 0;

                let shortName = lower.includes('gemini') ? 'Gemini' : 'Claude';
                let priority = lower.includes('gemini') ? 6 : 5;

                if (!groupMap.has(shortName)) {
                    groupMap.set(shortName, { shortName, priority, displayPercent: pct, models: [m] });
                } else {
                    groupMap.get(shortName).models.push(m);
                }
            });

            let displayGroups = Array.from(groupMap.values());
            displayGroups.sort((a, b) => {
                const aCrit = a.displayPercent < 20;
                const bCrit = b.displayPercent < 20;
                if (aCrit && !bCrit) return -1;
                if (!aCrit && bCrit) return 1;
                return b.priority - a.priority;
            });

            displayGroups.forEach(group => {
                const pct = group.displayPercent;
                let icon = "🟢";
                if (pct < 20) icon = "🔴";
                else if (pct < 50) icon = "🟡";
                statusTextParts.push(`${icon} ${group.shortName} ${pct.toFixed(0)}%`);
            });
        }

        // Fallback: tampilkan persentase credit jika model & group kosong
        if (statusTextParts.length === 0) {
            const availPrompt = data.credits?.prompt?.available || 0;
            const totalPrompt = data.credits?.prompt?.total || 1;
            const promptPct = (availPrompt / totalPrompt) * 100;

            let icon = "$(check)";
            if (promptPct < 20) icon = "$(alert)";
            else if (promptPct < 50) icon = "$(issue-opened)";

            statusTextParts.push(`${icon} Credits: ${promptPct.toFixed(0)}%`);
        }

        myStatusBarItem.text = statusTextParts.join('  ');

        // --- Tooltip detail ---
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        // Header berversi dinamis sesuai instruksi
        md.appendMarkdown(`**Open Quota Antigravity** v.${EXT_VERSION} by AiBersemi.\n\n`);

        // Info user & plan (tanpa teks credits)
        if (data.user && (data.user.name || data.user.email)) {
            const userParts = [];
            if (data.user.name && data.user.name !== 'Unknown') {
                userParts.push(`**${data.user.name}**`);
            }
            if (data.user.email) {
                userParts.push(`(${data.user.email})`);
            }
            const planStr = data.user.plan || 'Free';
            const tierStr = data.user.tierName ? ` (${data.user.tierName})` : '';

            md.appendMarkdown(`👤 ${userParts.join(' ')} — ${planStr}${tierStr}\n\n`);
        }

        // Widget kuota Opsi B: Markdown murni dengan bilah balok berwarna (hijau, kuning, merah)
        // Tanpa icon bulat hijau, tanpa prompt/flow credits, dan tanpa teks disclaimer
        if (groups.length > 0) {
            groups.forEach((g, gIdx) => {
                if (gIdx > 0) md.appendMarkdown(`\n---\n\n`);
                else md.appendMarkdown(`---\n\n`);

                md.appendMarkdown(`### ${g.displayName.toUpperCase()}\n`);
                if (g.description) {
                    md.appendMarkdown(`*${g.description}*\n\n`);
                }

                (g.buckets || []).forEach(b => {
                    const frac = b.remainingFraction;
                    const pct = frac * 100;
                    const barStr = renderColoredProgressBar(frac, 12);
                    const statusStr = formatResetTime(b.resetTime, frac);

                    md.appendMarkdown(`**${b.displayName}**  \n`);
                    md.appendMarkdown(`${barStr} **${pct.toFixed(2)}%**  \n`);
                    md.appendMarkdown(`${statusStr}  \n\n`);
                });
            });
            md.appendMarkdown(`---\n`);
        } else if (models.length > 0) {
            md.appendMarkdown(`---\n\n`);
            models.forEach(m => {
                const frac = (Number(m.remaining_percent) || 0) / 100;
                const barStr = renderColoredProgressBar(frac, 12);
                const statusStr = formatResetTime(m.reset_time, frac);

                md.appendMarkdown(`**${m.label || 'Unknown'}**  \n`);
                md.appendMarkdown(`${barStr} **${(frac * 100).toFixed(2)}%**  \n`);
                md.appendMarkdown(`${statusStr}  \n\n`);
            });
            md.appendMarkdown(`---\n`);
        } else {
            md.appendMarkdown(`_No models or quota groups found_\n`);
        }

        // Footer Last Refresh
        md.appendMarkdown(`\n_Last Refresh: ${formatTime24(new Date())}_`);
        myStatusBarItem.tooltip = md;

    } catch (e) {
        console.error('UI Update error:', e);
        myStatusBarItem.text = "$(error) UI Error";
    }
}

// --- Logic (Merged) ---

async function checkQuota() {
    try {
        // 1) Cari semua proses language_server
        const procs = await findProcesses();
        if (procs.length === 0) {
            console.log('[open-quota-antigravity] Tidak ditemukan proses language_server');
            return null;
        }
        let probeCount = 0;

        for (const proc of procs) {
            // 2) Ambil token CSRF dari command line proses
            const csrfToken = parseCsrfToken(proc.cmdline);
            if (!csrfToken) continue;

            // 3) Cari port yang listen pada PID ini
            const ports = await getPorts(proc.pid);
            const limitedPorts = ports.slice(0, MAX_PORTS_PER_PROCESS);
            for (const port of limitedPorts) {
                if (probeCount >= MAX_TOTAL_PORT_PROBES) {
                    return null;
                }
                probeCount++;
                // 4) Panggil endpoint GetUserStatus lokal
                const res = await fetchQuota(port, csrfToken);
                if (res) {
                    // 5) Normalisasi data agar konsisten di UI
                    return formatData(res);
                }
            }
        }
    } catch {
        /* Best-effort quota probe failed; caller handles null result. */
    }
    return null;
}

function execAsync(command, options = {}) {
    return new Promise((resolve, reject) => {
        cp.exec(command, { timeout: 8000, maxBuffer: 2 * 1024 * 1024, ...options }, (error, stdout) => {
            if (error && !stdout) {
                reject(error);
                return;
            }
            resolve((stdout || '').trim());
        });
    });
}

/**
 * Robust process finder (merged from CLI version)
 */
async function findProcesses() {
    const results = [];
    const searchString = 'language_server';
    // Sanitize searchString for safe shell usage: allow only alphanumeric, underscore, and hyphen
    const safeSearchString = searchString.replace(/[^a-zA-Z0-9_-]/g, '');

    if (IS_WINDOWS) {
        // Windows: PowerShell dulu, fallback ke WMIC
        const psCommand = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${safeSearchString}*' } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`;
        try {
            const stdout = await execAsync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`);
            if (!stdout || !stdout.trim()) return [];

            let processes = [];
            try {
                const parsed = JSON.parse(stdout.trim());
                processes = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            } catch (e) {
                console.warn('[open-quota-antigravity] JSON parse error (PowerShell):', e.message);
                return [];
            }

            processes.forEach(p => {
                if (p.ProcessId && p.CommandLine) {
                    results.push({ pid: p.ProcessId, cmdline: p.CommandLine });
                }
            });
        } catch {
            // Fallback to wmic
            try {
                const wmicOut = await execAsync(`wmic process where "CommandLine like '%${safeSearchString}%'" get ProcessId,CommandLine /format:csv`);
                const lines = wmicOut.split('\n');
                lines.forEach(line => {
                    if (!line.trim() || line.includes('ProcessId')) return;
                    const parts = line.split(',');
                    // Validate minimum parts: at least CSV header value + PID column
                    if (parts.length >= 2) {
                        // Use explicit numeric index for the last element (PID column)
                        const lastIdx = parts.length - 1;
                        const pid = parseInt(parts[lastIdx], 10);
                        const cmdline = parts.slice(1, lastIdx).join(',');
                        if (!isNaN(pid) && pid > 0) results.push({ pid, cmdline });
                    }
                });
            } catch { /* WMIC fallback failed; return any collected results. */ }
        }
    } else {
        // Linux/Mac
        try {
            // Linux: coba pgrep dulu
            if (process.platform === 'linux') {
                try {
                    const stdout = await execAsync(`pgrep -a -f "${safeSearchString}"`);
                    const lines = stdout.split('\n');
                    for (const line of lines) {
                        const firstSpace = line.indexOf(' ');
                        if (firstSpace > 0) {
                            const pid = parseInt(line.substring(0, firstSpace));
                            const cmdline = line.substring(firstSpace + 1);
                            results.push({ pid, cmdline });
                        }
                    }
                    if (results.length > 0) {
                        return results.filter(p => parseCsrfToken(p.cmdline));
                    }
                } catch { /* pgrep unavailable or failed; continue with ps fallback. */ }
            }

            // Fallback: ps -A jika pgrep tidak tersedia
            const stdout = await execAsync(`ps -A -o pid,command`);
            const lines = stdout.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                const firstSpace = trimmed.indexOf(' ');
                if (firstSpace > 0) {
                    const pid = parseInt(trimmed.substring(0, firstSpace));
                    const cmdline = trimmed.substring(firstSpace + 1);
                    if (cmdline.includes(searchString)) {
                        results.push({ pid, cmdline });
                    }
                }
            }
        } catch { /* Process lookup failed; return any collected results. */ }
    }
    return results.filter(p => parseCsrfToken(p.cmdline));
}

function parseCsrfToken(cmdline) {
    // Ambil nilai setelah --csrf_token (format --csrf_token=... atau --csrf_token ...)
    // Mendukung token dengan atau tanpa tanda kutip
    const regex = /--csrf_token[=\s]+(?:["']([^"']+)["']|([^\s"']+))/;
    const match = cmdline.match(regex);
    return match ? (match[1] || match[2] || null) : null;
}

async function getPorts(pid) {
    // Validate pid is a safe positive integer to prevent command injection and prototype access
    const safePid = Number(pid);
    if (!Number.isFinite(safePid) || safePid <= 0 || !Number.isInteger(safePid)) {
        return [];
    }
    const ports = new Set();
    if (IS_WINDOWS) {
        // Metode 1: PowerShell Get-NetTCPConnection (lebih cepat, filter langsung per PID)
        try {
            const psCmd = `Get-NetTCPConnection -OwningProcess ${safePid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort | ConvertTo-Json -Compress`;
            const stdout = await execAsync(`powershell -NoProfile -Command "${psCmd}"`);
            if (stdout && stdout.trim()) {
                const parsed = JSON.parse(stdout.trim());
                const portList = Array.isArray(parsed) ? parsed : [parsed];
                portList.forEach(p => {
                    const port = parseInt(p);
                    if (!isNaN(port)) ports.add(port);
                });
            }
        } catch { /* PowerShell port lookup failed; fall back to netstat. */ }
        // Metode 2 (Fallback): netstat -ano jika PowerShell gagal atau tidak ada port ditemukan
        if (ports.size === 0) {
            try {
                const stdout = await execAsync(`netstat -ano`);
                const lines = stdout.split('\n');
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    // Safe bracket notation: validate array has sufficient elements before indexed access
                    if (parts.length < 5) continue;
                    const protocol = parts[0];          // e.g., "TCP"
                    const localAddr = parts[1];         // e.g., "127.0.0.1:12345"
                    const state = (parts[3] || '').toUpperCase(); // e.g., "LISTENING"
                    const linePid = parseInt(parts.at(-1), 10); // PID column (last)
                    if (protocol === 'TCP' && linePid === safePid && state.startsWith('LISTEN')) {
                        if (localAddr.includes('127.0.0.1') || localAddr.includes('0.0.0.0') || localAddr.includes('[::]') || localAddr.includes('[::1]')) {
                            const port = parseInt(localAddr.split(':').pop());
                            if (!isNaN(port)) ports.add(port);
                        }
                    }
                }
            } catch { /* netstat fallback failed; return any collected ports. */ }
        }
    } else {
        try {
            // Unix: coba lsof dulu untuk port LISTEN
            const stdout = await execAsync(`lsof -Pan -p ${safePid} -i TCP -s TCP:LISTEN`);
            const lines = stdout.split('\n');
            for (const line of lines) {
                if (line.includes('LISTEN')) {
                    const parts = line.trim().split(/\s+/);
                    for (const part of parts) {
                        if (part.includes(':') && (part.startsWith('127.0.0.1') || part.startsWith('0.0.0.0') || part.startsWith('*') || part.startsWith('[::1]') || part.startsWith('[::]'))) {
                            const port = parseInt(part.split(':').pop());
                            if (!isNaN(port)) ports.add(port);
                        }
                    }
                }
            }
        } catch {
            // Fallback di Linux: gunakan ss jika lsof tidak tersedia
            if (process.platform === 'linux') {
                try {
                    const ssOut = await execAsync(`ss -lptn`);
                    if (ssOut.includes(`pid=${safePid}`)) {
                        const lines = ssOut.split('\n');
                        for (const line of lines) {
                            if (line.includes(`pid=${safePid}`)) {
                                const parts = line.trim().split(/\s+/);
                                for (const part of parts) {
                                    if (part.includes(':')) {
                                        const port = parseInt(part.split(':').pop());
                                        if (!isNaN(port)) ports.add(port);
                                    }
                                }
                            }
                        }
                    }
                } catch { /* ss fallback failed; return any collected ports. */ }
            }
        }
    }
    return Array.from(ports);
}

function fetchRpcWithProtocol(protocol, port, csrfToken, method) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const postData = JSON.stringify({ metadata: { ide_name: "antigravity" } });
        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: `/exa.language_server_pb.LanguageServerService/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': csrfToken,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 2000,
            rejectUnauthorized: false
        };

        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) done(JSON.parse(data));
                    else done(null);
                } catch { done(null); }
            });
        });
        req.on('error', () => done(null));
        req.on('timeout', () => {
            req.destroy();
            done(null);
        });
        req.end(postData);
    });
}

async function fetchQuota(port, csrfToken) {
    for (const proto of [https, http]) {
        // Probe endpoint resmi RetrieveUserQuotaSummary
        const quotaSummary = await fetchRpcWithProtocol(proto, port, csrfToken, 'RetrieveUserQuotaSummary');
        if (quotaSummary && quotaSummary.response) {
            // Ambil juga GetUserStatus untuk melengkapi info pengguna & kredit
            const userStatus = await fetchRpcWithProtocol(proto, port, csrfToken, 'GetUserStatus');
            return {
                quotaSummary,
                userStatus
            };
        }

        // Fallback: jika RetrieveUserQuotaSummary tidak ada, coba GetUserStatus saja
        const userStatus = await fetchRpcWithProtocol(proto, port, csrfToken, 'GetUserStatus');
        if (userStatus && userStatus.userStatus) {
            return {
                quotaSummary: null,
                userStatus
            };
        }
    }
    return null;
}

function formatData(data) {
    if (!data) return null;

    const rawUserStatus = data.userStatus || data;
    const rawQuotaSummary = data.quotaSummary;

    const us = rawUserStatus.userStatus || {};
    const ps = us.planStatus || {};
    const pi = ps.planInfo || {};
    const ut = us.userTier || {};
    const legacyModels = (us.cascadeModelConfigData && us.cascadeModelConfigData.clientModelConfigs) || [];

    const promptAvailable = ps.availablePromptCredits
        ?? ps.availableDailyCredits
        ?? ps.sprintCapacity?.available
        ?? 0;
    const promptTotal = pi.monthlyPromptCredits
        ?? pi.dailyPromptCredits
        ?? ps.sprintCapacity?.total
        ?? 1;
    const flowAvailable = ps.availableFlowCredits
        ?? ps.availableDailyFlowCredits
        ?? ps.marathonCapacity?.available
        ?? 0;
    const flowTotal = pi.monthlyFlowCredits
        ?? pi.dailyFlowCredits
        ?? ps.marathonCapacity?.total
        ?? 1;

    let groups = [];
    if (rawQuotaSummary && rawQuotaSummary.response && Array.isArray(rawQuotaSummary.response.groups)) {
        groups = rawQuotaSummary.response.groups.map(g => {
            const buckets = (g.buckets || []).map(b => ({
                bucketId: b.bucketId || '',
                displayName: b.displayName || '',
                description: b.description || '',
                window: b.window || '',
                remainingFraction: Number.isFinite(Number(b.remainingFraction)) ? Number(b.remainingFraction) : 0,
                resetTime: b.resetTime || null
            }));
            return {
                displayName: g.displayName || '',
                description: g.description || '',
                buckets
            };
        });
    }

    const models = legacyModels.filter(m => m && m.quotaInfo).map(m => {
        const qi = m.quotaInfo || {};
        const fraction = Number(qi.remainingFraction);
        return {
            label: m.label || 'Unknown Model',
            remaining_percent: (Number.isFinite(fraction) ? fraction : 0) * 100,
            reset_time: qi.resetTime || null
        };
    });

    // Fallback sintetis jika grup resmi kosong:
    if (groups.length === 0 && models.length > 0) {
        const geminiModels = models.filter(m => (m.label || '').toLowerCase().includes('gemini'));
        const claudeModels = models.filter(m => !(m.label || '').toLowerCase().includes('gemini'));

        if (geminiModels.length > 0) {
            const minFrac = Math.min(...geminiModels.map(m => m.remaining_percent / 100));
            const resetTime = geminiModels.find(m => m.reset_time)?.reset_time || null;
            groups.push({
                displayName: 'Gemini Models',
                description: 'Models within this group: ' + geminiModels.map(m => m.label).slice(0, 3).join(', '),
                buckets: [
                    {
                        bucketId: 'gemini-5h',
                        displayName: 'Five Hour Limit Remaining',
                        description: '',
                        window: '5h',
                        remainingFraction: minFrac,
                        resetTime
                    }
                ]
            });
        }
        if (claudeModels.length > 0) {
            const minFrac = Math.min(...claudeModels.map(m => m.remaining_percent / 100));
            const resetTime = claudeModels.find(m => m.reset_time)?.reset_time || null;
            groups.push({
                displayName: 'Claude and GPT models',
                description: 'Models within this group: ' + claudeModels.map(m => m.label).slice(0, 3).join(', '),
                buckets: [
                    {
                        bucketId: '3p-5h',
                        displayName: 'Five Hour Limit Remaining',
                        description: '',
                        window: '5h',
                        remainingFraction: minFrac,
                        resetTime
                    }
                ]
            });
        }
    }

    return {
        user: {
            name: us.name || 'Unknown',
            email: us.email || '',
            plan: pi.planName || 'Free',
            tier: pi.teamsTier || '',
            tierName: ut.name || ''
        },
        credits: {
            prompt: {
                available: promptAvailable,
                total: promptTotal
            },
            flow: {
                available: flowAvailable,
                total: flowTotal
            }
        },
        groups,
        models
    };
}

function formatDetailText(data) {
    let tierStr = '';
    if (data.user?.tierName) tierStr = ` — ${data.user.tierName}`;
    const user = `${data.user?.name || 'N/A'} (${data.user?.plan || 'Free'}${tierStr})`;

    const pAvail = (data.credits?.prompt?.available || 0).toLocaleString();
    const pTotal = (data.credits?.prompt?.total || 0).toLocaleString();
    const fAvail = (data.credits?.flow?.available || 0).toLocaleString();
    const fTotal = (data.credits?.flow?.total || 0).toLocaleString();
    const credits = `Prompt: ${pAvail} / ${pTotal}\nFlow: ${fAvail} / ${fTotal}`;

    let quotaDetails = '';
    if (data.groups && data.groups.length > 0) {
        quotaDetails = data.groups.map(g => {
            const bucketLines = (g.buckets || []).map(b => {
                const pct = (b.remainingFraction * 100).toFixed(1);
                const status = formatResetTime(b.resetTime, b.remainingFraction);
                return `  - ${b.displayName}: ${pct}% (${status})`;
            }).join('\n');
            return `${g.displayName}:\n${bucketLines}`;
        }).join('\n\n');
    } else if (data.models && data.models.length > 0) {
        quotaDetails = data.models.map(m => {
            const pct = Number(m.remaining_percent) || 0;
            let resetStr = '';
            if (m.reset_time) {
                try {
                    const d = new Date(m.reset_time);
                    if (d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0) {
                        resetStr = ` (reset ${d.toLocaleTimeString()})`;
                    }
                } catch { /* Date parse failed; keep reset text empty. */ }
            }
            return `${m.label || 'Unknown'}: ${pct.toFixed(1)}%${resetStr}`;
        }).join('\n');
    }

    return `User: ${user}\nCredits:\n${credits}\n\nQuota:\n${quotaDetails}`;
}

module.exports = {
    activate,
    deactivate
}
