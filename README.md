<h1 align="center">Open Quota Antigravity</h1>

<p align="center">
  <a href="https://github.com/aibersemi/open-quota-antigravity"><img src="https://img.shields.io/github/package-json/v/aibersemi/open-quota-antigravity?style=flat-square&color=007ACC" alt="Version" /></a>
  <a href="https://github.com/aibersemi/open-quota-antigravity/blob/main/LICENSE"><img src="https://img.shields.io/github/license/aibersemi/open-quota-antigravity?style=flat-square&color=2EA043" alt="License" /></a>
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.85.0-007ACC?style=flat-square&logo=visualstudiocode" alt="VS Code" /></a>
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Linux-555555?style=flat-square" alt="Platform" />
</p>

**Open Quota Antigravity** is a lightweight VS Code extension that lets you monitor your Antigravity (Codeium/Windsurf) quota in real-time, right from your status bar. No more guessing when your premium models will reset!

<br/>

<div align="center">
  <img src="https://github.com/aibersemi/open-quota-antigravity/raw/HEAD/demo.webp" alt="Open Quota Antigravity Demo" width="600" />
</div>

---

## 🚀 What It Does

- **Real-time Monitoring:** Instantly see the remaining percentage of your available models (Gemini Flash/Pro, Claude Opus/Sonnet, GPT, etc.).
- **Smart Grouping:** Models are smartly grouped into **Gemini** and **Claude** categories based on priority. The displayed percentage for each group is taken from the highest-priority model found in that group, giving you an immediate sense of your available quota.
- **Fallback Indicator:** If no models are found, the extension gracefully falls back to showing your overall **Credits** percentage.
- **Shared Quota Awareness:** Reflects Antigravity 2026's shared rate limit pool for Gemini models and the unified quota for non-Gemini models.
- **Smart Indicators:** Visual feedback with colors to warn you when running low:
  - 🟢 **Green:** Plenty of quota (> 50%)
  - 🟡 **Yellow:** Running low (< 50%)
  - 🔴 **Red:** Critical/Exhausted (< 20%)
- **Zero Configuration:** Automatically detects the running language server process. No API keys or manual setup required.
- **HTTPS Support:** Fully compatible with Antigravity's HTTPS-based language server (self-signed certificates handled automatically).
- **Detailed Insights:** Hover over the status bar item to see a full breakdown, including:
  - User name, plan, and tier info
  - Prompt and Flow credit usage (Sprint & Marathon capacity)
  - Exact quota percentages and reset timestamps for each model

---

## 🛠️ How to Use

1. **Install:**
   - Install this extension from the Marketplace or VSIX.
   - Ensure the official **Antigravity** or **Codeium** extension is installed and you are logged in.
2. **Check Status Bar:**
   - Look at the bottom-right of your VS Code window.
   - You should see indicators like `🟢 Gemini 100%  🟢 Claude 20%` (or a fallback like `✔️ Credits: 100%`).
3. **Get Details:**
   - **Hover** over the status indicator to see a rich tooltip with all model details.
   - Use command palette `Open Quota Antigravity: Show Details` for a full popup.

---

## ⚙️ Settings

| Setting | What it does | Default |
| :--- | :--- | :--- |
| `openQuotaAntigravity.refreshInterval` | How often (in seconds) to check for quota updates (min: 30, default 5 minutes). | `300` |

---

## ℹ️ Requirements

- **Visual Studio Code** v1.85.0 or newer (or compatible fork: Antigravity, Windsurf, Cursor).
- An active **Antigravity** or **Codeium** session (the language server process must be running).

---

## ❓ FAQ

**Q: Do I need to install Python?**
> **No!** This extension is 100% native Node.js. It runs directly within VS Code without any external dependencies.

**Q: Does it work on Mac/Linux?**
> **Yes!** It supports Windows, macOS, and Linux out of the box.

**Q: Does it support HTTPS language servers?**
> **Yes!** The extension automatically tries HTTPS first (with self-signed certificate support) and falls back to HTTP for backward compatibility.

**Q: Does it support the new Antigravity 2026 shared quota?**
> **Yes!** The extension handles both legacy per-model quotas and the new unified Gemini rate limit pool.

---

## Support

If this extension saves you time, you can support its development through [Saweria](https://saweria.co/aibersemi).

---

## 💡 Feedback

Found a bug or have a suggestion? Feel free to open an issue or contribute!
