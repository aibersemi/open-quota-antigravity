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
// Extension version untuk logging
const EXT_VERSION = '1.1.2';

// Format waktu 24 jam (HH:mm:ss) untuk tooltip
function formatTime24(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
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

    const config = vscode.workspace.getConfiguration('quotaAntigravityFree');
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
        const models = data.models || [];

        // --- Smart Grouping ---
        // Gabung Flash & Pro menjadi "Gemini", selain itu menjadi "Claude".
        // Nilai persentase diambil dari model pertama yang ditemukan (paling atas).
        const groupMap = new Map(); // shortName -> { shortName, displayPercent, models[] }

        models.forEach(m => {
            const label = m.label || '';
            const lower = label.toLowerCase();
            const pct = Number(m.remaining_percent) || 0;

            let shortName;
            let priority; // Semakin tinggi = lebih penting untuk ditampilkan

            if (lower.includes('gemini')) {
                shortName = 'Gemini';
                priority = 6;
            } else {
                shortName = 'Claude';
                priority = 5;
            }

            if (!groupMap.has(shortName)) {
                // displayPercent: ambil dari model pertama yang ditemukan
                groupMap.set(shortName, { shortName, priority, displayPercent: pct, models: [m] });
            } else {
                const g = groupMap.get(shortName);
                g.models.push(m);
            }
        });

        // Konversi ke array dan sort:
        // 1. Model kritis (< 20%) selalu di kiri
        // 2. Lalu berdasarkan priority (Gemini > Claude)
        let displayGroups = Array.from(groupMap.values());
        displayGroups.sort((a, b) => {
            const aCrit = a.displayPercent < 20;
            const bCrit = b.displayPercent < 20;
            if (aCrit && !bCrit) return -1;
            if (!aCrit && bCrit) return 1;
            return b.priority - a.priority;
        });

        // Susun teks ringkas untuk status bar
        let statusTextParts = [];

        displayGroups.forEach(group => {
            const pct = group.displayPercent;
            let icon = "🟢";
            if (pct < 20) icon = "🔴";
            else if (pct < 50) icon = "🟡";

            statusTextParts.push(`${icon} ${group.shortName} ${pct.toFixed(0)}%`);
        });

        // Fallback: tampilkan persentase credit jika model kosong
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
        md.appendMarkdown(`**Open Quota Antigravity** v${EXT_VERSION} by AiBersemi\n\n`);

        // Info user & plan
        if (data.user) {
            md.appendMarkdown(`👤 ${data.user.name || 'N/A'} — ${data.user.plan || 'Free'}`);
            if (data.user.tierName) md.appendMarkdown(` (${data.user.tierName})`);
            md.appendMarkdown(`\n\n`);
        }

        // Info credits
        if (data.credits) {
            const pAvail = (data.credits.prompt?.available || 0).toLocaleString();
            const pTotal = (data.credits.prompt?.total || 0).toLocaleString();
            const fAvail = (data.credits.flow?.available || 0).toLocaleString();
            const fTotal = (data.credits.flow?.total || 0).toLocaleString();
            md.appendMarkdown(`💳 Prompt: ${pAvail}/${pTotal} · Flow: ${fAvail}/${fTotal}\n\n`);
        }

        // Daftar model per baris (diff codeblock)
        if (models.length > 0) {
            let diffContent = "";
            const sortedModels = [...models].sort((a, b) =>
                (Number(b.remaining_percent) || 0) - (Number(a.remaining_percent) || 0)
            );

            sortedModels.forEach(m => {
                const pct = Number(m.remaining_percent) || 0;
                let dateStr = "—";
                if (m.reset_time) {
                    try {
                        const d = new Date(m.reset_time);
                        if (d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0) {
                            const day = String(d.getDate()).padStart(2, '0');
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const hour = String(d.getHours()).padStart(2, '0');
                            const min = String(d.getMinutes()).padStart(2, '0');
                            dateStr = `${day}/${month} ${hour}:${min}`;
                        }
                    } catch (_) { /* date parse gagal, tetap pakai "—" */ }
                }

                const prefix = pct > 0 ? "+ " : "- ";
                const name = (m.label || 'Unknown').padEnd(36, ' ');
                const pctStr = (pct.toFixed(0) + "%").padEnd(6, ' ');

                diffContent += `${prefix}${name}${pctStr}   ${dateStr}\n`;
            });
            md.appendCodeblock(diffContent, 'diff');
        } else {
            md.appendMarkdown(`_No models found_\n`);
        }
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
    } catch (e) { }
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
        } catch (e) {
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
            } catch (ign) { }
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
                } catch (e) { }
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
        } catch (e) { }
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
        } catch (e) { /* fallback ke netstat */ }
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
            } catch (e) { }
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
        } catch (e) {
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
                } catch (ign) { }
            }
        }
    }
    return Array.from(ports);
}

function fetchQuota(port, csrfToken) {
    // Coba HTTPS dulu (Antigravity pakai self-signed cert), fallback ke HTTP
    return fetchQuotaWithProtocol(https, port, csrfToken).then(result => {
        if (result) return result;
        return fetchQuotaWithProtocol(http, port, csrfToken);
    });
}

function fetchQuotaWithProtocol(protocol, port, csrfToken) {
    return new Promise((resolve) => {
        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        // Request ke language server lokal (loopback)
        const postData = JSON.stringify({ wrapper_data: {} });
        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': csrfToken,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 2000,
            rejectUnauthorized: false // Self-signed cert pada language server lokal
        };

        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) done(JSON.parse(data));
                    else done(null);
                } catch (e) { done(null); }
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

function formatData(data) {
    // Normalisasi struktur supaya UI konsisten dan mudah dipakai
    // Mendukung format Antigravity 2026: shared rate limit, sprint/marathon capacity
    const us = data.userStatus || {};
    const ps = us.planStatus || {};
    const pi = ps.planInfo || {};
    const ut = us.userTier || {};
    const models = (us.cascadeModelConfigData && us.cascadeModelConfigData.clientModelConfigs) || [];

    // Credits: prioritaskan field terbaru, fallback ke legacy
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
        models: models.filter(m => m && m.quotaInfo).map(m => {
            const qi = m.quotaInfo || {};
            const fraction = Number(qi.remainingFraction);
            return {
                label: m.label || 'Unknown Model',
                remaining_percent: (Number.isFinite(fraction) ? fraction : 0) * 100,
                reset_time: qi.resetTime || null
            };
        })
    };
}

function formatDetailText(data) {
    // Teks detail untuk popup modal
    let tierStr = '';
    if (data.user?.tierName) tierStr = ` — ${data.user.tierName}`;
    const user = `${data.user?.name || 'N/A'} (${data.user?.plan || 'Free'}${tierStr})`;

    const pAvail = (data.credits?.prompt?.available || 0).toLocaleString();
    const pTotal = (data.credits?.prompt?.total || 0).toLocaleString();
    const fAvail = (data.credits?.flow?.available || 0).toLocaleString();
    const fTotal = (data.credits?.flow?.total || 0).toLocaleString();
    const credits = `Prompt: ${pAvail} / ${pTotal}\nFlow: ${fAvail} / ${fTotal}`;

    let models = "";
    if (data.models && data.models.length > 0) {
        models = data.models.map(m => {
            const pct = Number(m.remaining_percent) || 0;
            let resetStr = '';
            if (m.reset_time) {
                try {
                    const d = new Date(m.reset_time);
                    if (d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0) {
                        resetStr = ` (reset ${d.toLocaleTimeString()})`;
                    }
                } catch (_) { /* ignore */ }
            }
            return `${m.label || 'Unknown'}: ${pct.toFixed(1)}%${resetStr}`;
        }).join('\n');
    }

    return `User: ${user}\nCredits:\n${credits}\n\nModels:\n${models}`;
}

module.exports = {
    activate,
    deactivate
}
