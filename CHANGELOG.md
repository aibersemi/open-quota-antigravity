# Changelog

All notable changes to **Open Quota Antigravity** are documented here.

## [Unreleased]

## [1.1.4] — 2026-06-30

### Fixed
- Fixed missing Changelog tab in Open VSX and VS Code Marketplace by including `CHANGELOG.md` in the `.vsix` bundle.

## [1.1.3] — 2026-06-30

### Added
- Added `AGENTS.md` to define strict AI execution rules, publishing workflows, and language standards.

### Changed
- Renamed the main configuration key from `quotaAntigravityFree.refreshInterval` to `openQuotaAntigravity.refreshInterval` to align with the official extension name.
- Updated `.vscodeignore` to exclude `AGENTS.md` from the published `.vsix` bundle.

### Fixed
- Fixed strict lint errors by making intentionally ignored fallback failures explicit.

## [1.1.2] — 2026-06-29

### Added
- Added `safeSearchString` sanitization (only allows `[a-zA-Z0-9_-]`) before interpolation into shell commands (`PowerShell`, `wmic`, `pgrep`).
- Added PID validation (`Number.isFinite`, `Number.isInteger`, `> 0`) at the beginning of the `getPorts()` function; an invalid PID immediately returns an empty array.

### Changed
- Replaced inline bracket notation (`parts[0]`, `parts[3]`, `parts[parts.length - 1]`) with explicit named variables and the safer `Array.prototype.at(-1)` method.

### Fixed
- Fixed bracket object notation with user input in `findProcesses()` and `getPorts()` functions to prevent prototype pollution and command injection risks.
- Fixed return type bug in `getPorts()` from `Set` to an empty array (`[]`) for caller consistency.

## [1.1.1] — 2026-06-24

### Added
- Added visual indicators for Gemini and Claude model groups.
- Added Fallback Indicator (showing overall Credits when no models are detected).

### Changed
- Optimized status bar tooltip format (added diff formatting).
- Improved detection of Antigravity/Codeium local language server process.
- Updated Smart Grouping description to accurately reflect Gemini and Claude grouping logic.
- Updated visuals to match the new status bar format.

## [1.1.0] — 2026-06-19

### Added
- Added smart grouping based on model priority ("Gemini" and "Claude") in the status bar.

### Fixed
- Fixed a bug related to time formatting in `reset_time` that resulted in "NaN" values with date validation fallback.

## [1.0.9] — 2026-06-17

### Added
- Initial release of Open Quota Antigravity.
- Real-time quota monitoring on the VS Code status bar.
- Automatic loopback server port probing.

## [1.0.8] — 2026-06-15

### Changed
- Optimized parsing and sanitization of the `language_server` search string in shell executions to prevent command injection risks.
- Refined the loading indicator on the status bar by displaying `$(sync~spin) Quota...` while data fetching is in progress.

## [1.0.5] — 2026-06-01

### Added
- Added a modal detail popup functionality (`open-quota-antigravity.showDetail`) to present full subscription info, username, and model details.
- Integrated direct extension version detection (`EXT_VERSION`) into activation logging.

## [1.0.0] — 2026-05-15

### Added
- Implemented the first `StatusBarItem` to display quota summaries.
- Added a custom `refreshInterval` configuration setting in `package.json`.

### Changed
- **Internal Beta:** Migrated the entire codebase from a standalone CLI script to an official VS Code extension module.

## [0.9.8] — 2026-04-20

### Added
- Registered manual extension commands: `open-quota-antigravity.refresh` and `open-quota-antigravity.reload`.
- Introduced a silent refresh capability when the user clicks the text in the Status Bar without showing an information popup.

## [0.9.5] — 2026-04-05

### Added
- **Alpha Extension:** Limited trial of the VS Code extension prototype.

### Changed
- Restricted the minimum auto-refresh interval to 30 seconds to prevent overloading the local server with requests.

## [0.9.0] — 2026-03-10

### Added
- Supported HTTPS protocol for the local language server.
- Added a background polling mechanism for periodic status updates.

### Changed
- Automatic handling of self-signed certificates (`rejectUnauthorized: false`).

## [0.7.5] — 2026-02-28

### Added
- Introduced a state-of-the-art data normalization structure (`formatData`) to support a new architecture: shared rate limits, sprint capacity, and marathon capacity.
- Implemented a graceful fallback for quota percentage calculation if a model doesn't have quota fraction information (`remainingFraction`).

## [0.6.0] — 2026-02-15

### Added
- Implemented a dual fallback protocol: sequentially attempts an `https` connection, then switches to standard `http` to ensure connectivity compatibility.
- Added a probing control limit (max 8 ports per process and total max search of 24 ports) to make the extension more lightweight.

## [0.5.0] — 2026-02-01

### Added
- Implemented automatic port discovery (`getPorts`) using `lsof` on Unix and `netstat` on Windows.

### Changed
- Optimized the regex parser to extract the CSRF token from the language server process command line (`cmdline`).

## [0.3.5] — 2026-01-28

### Added
- Added alternate listen port detection on Linux systems using the `ss -lptn` network utility command as the primary backup if the `lsof` utility is absent.

## [0.2.0] — 2026-01-20

### Added
- Extracted ProcessId and parsed JSON format output directly through the PowerShell command pipeline.

### Changed
- Improved the process discovery method on Windows systems via PowerShell (`Get-CimInstance`), with a fallback route to the legacy WMIC utility command line.

## [0.1.0] — 2026-01-05

### Added
- Created a process detector (`findProcesses`) to detect active `language_server` binary processes on Linux and Windows operating systems.

## [0.0.5] — 2025-12-28

### Added
- Initial experiment with the JSON response object parsing method from the internal endpoint `/exa.language_server_pb.LanguageServerService/GetUserStatus`.
- Trialed manual insertion of mandatory parameter headers such as `X-Codeium-Csrf-Token` in the HTTP protocol.

## [0.0.1] — 2025-12-15

### Added
- **Initial Concept:** The initial project idea was born after the daily Gemini quota limit ran out suddenly while coding.
- First experiment using manual curl to request user status data from the localhost language server port.
