# ZCC Log Analyzer

A Python tool for scanning Zscaler Client Connector (ZCC) log ZIP archives, consolidating errors chronologically, detecting activity spikes, and generating rich reports with optional baseline comparison.

---

## Features

| Feature | Description |
|---|---|
| **ZIP Ingestion** | Extracts all `.log` files from a ZCC log bundle ZIP, including nested ZIPs |
| **Multi-format Parsing** | Handles Windows, macOS, ISO 8601, syslog, epoch, and time-only timestamp formats |
| **Error Code Database** | 60+ explicit ZCC error codes across 6 categories + 25 keyword pattern rules |
| **Chronological Timeline** | Merges events from all log files into a single sorted timeline |
| **Spike Detection** | Sliding N-minute window analysis flags periods of elevated activity |
| **Baseline Diffing** | Compare incident logs against a baseline ZIP to find new/resolved/changed errors |
| **Console Report** | Color-coded rich terminal output with tables and panels |
| **HTML Report** | Self-contained dark-mode HTML with Chart.js timeline, filterable tables, and diff view |

---

## Quick Start

### 1. Install dependencies

```bash
cd python/zcc-log-analyzer
pip install -r requirements.txt
```

### 2. Run analysis

```bash
# Basic analysis — console output + HTML report
python zcc_analyzer.py --log /path/to/zcc_logs.zip

# Console output only (no HTML file)
python zcc_analyzer.py --log zcc_logs.zip --format console

# HTML report only, custom output path
python zcc_analyzer.py --log zcc_logs.zip --format html --output report.html

# With baseline comparison
python zcc_analyzer.py --log incident.zip --baseline baseline.zip

# List all known ZCC error codes
python zcc_analyzer.py --list-codes --log dummy.zip
```

---

## CLI Reference

```
usage: zcc_analyzer [-h] --log INCIDENT.ZIP [--baseline BASELINE.ZIP]
                    [--output REPORT.HTML] [--format {console,html,both}]
                    [--max-events N] [--min-severity {DEBUG,INFO,WARNING,ERROR,CRITICAL}]
                    [--show-unmatched] [--spike-window MINUTES]
                    [--spike-threshold MULTIPLIER] [--spike-min COUNT]
                    [--increase-threshold RATIO] [--decrease-threshold RATIO]
                    [--verbose] [--version] [--list-codes]
```

### Input

| Flag | Default | Description |
|---|---|---|
| `--log`, `-l` | *(required)* | Path to the ZCC log ZIP archive |
| `--baseline`, `-b` | None | Path to a baseline ZIP for comparison |

### Output

| Flag | Default | Description |
|---|---|---|
| `--output`, `-o` | auto-generated | HTML report output path |
| `--format`, `-f` | `both` | `console`, `html`, or `both` |
| `--max-events` | `200` | Max events shown in console output |

### Filtering

| Flag | Default | Description |
|---|---|---|
| `--min-severity` | `WARNING` | Minimum severity: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `--show-unmatched` | off | Include unmatched events in frequency table |

### Spike Detection

| Flag | Default | Description |
|---|---|---|
| `--spike-window` | `5` | Time window size in minutes |
| `--spike-threshold` | `2.0` | Spike if count > average × threshold |
| `--spike-min` | `10` | Minimum absolute count to flag as spike |

### Baseline Diff

| Flag | Default | Description |
|---|---|---|
| `--increase-threshold` | `1.5` | Ratio above which an error is "increased" (50% increase) |
| `--decrease-threshold` | `0.5` | Ratio below which an error is "decreased" (50% decrease) |

---

## Error Code Coverage

### Cloud Authentication Error Codes (numeric)
| Code | Message |
|---|---|
| `-1` | Failed to Initialize Authentication: PAC Download Failed |
| `-2` | Failed to Initialize Authentication: Invalid Custom PAC File |
| `-3` | Failed to Initialize Authentication: VPN Detected |
| `-4` | Failed to Initialize Authentication: Authentication Disabled |
| `-5` | Failed to Identify Authentication Service |
| `-6` | Failed to Authenticate: Login Failed |
| `-7` | Network Connection not Available |
| `-8` | Failed to Authenticate: Enrollment Certificate Not Found |
| `-9` | Failed to Authenticate: SAML Response Invalid |
| `-10` | Failed to Authenticate: SAML Token Expired |
| `-11` | Failed to Authenticate: Kerberos Authentication Failed |
| `-12` | Failed to Authenticate: User Not Provisioned |
| `-13` | Failed to Authenticate: License Expired |
| `-14` | Failed to Authenticate: Account Locked |
| `-15` | Failed to Authenticate: MFA Required |
| `-16` | Failed to Authenticate: Device Not Trusted |
| `-17` | Failed to Authenticate: Proxy Authentication Required |
| `-18` | Failed to Authenticate: SSL Inspection Certificate Error |
| `-19` | Failed to Authenticate: Cloud Not Reachable |
| `-20` | Failed to Authenticate: Timeout |

### Cloud Error Codes
Gateway unreachable, DNS failure, SSL handshake, connection reset, policy enforcement, bandwidth control, tunnel establishment/disconnection/reconnection, PAC file errors, proxy configuration, service errors (500/503).

### ZPA Authentication Error Codes
Certificate not found/expired/revoked, IdP authentication failure, broker unreachable, policy not found, tunnel creation failure, App Connector down, Service Edge unreachable, device posture failure, enrollment token invalid, machine tunnel failure.

### Connection Status Error Codes
Disconnected, Connecting, Partial Tunnel, Disabled, Suspended, Trusted Network Detected, Connection Timeout, Authentication Required, Gateway Error, Captive Portal Detected, Fallback Mode, Client Upgrade Required.

### Portal & Report Issue Error Codes
Portal authentication, session expiry, configuration push, API errors, enrollment failures, log upload, diagnostic collection, report submission.

### Keyword Pattern Rules (25 rules)
Tunnel down/up, reconnection, authentication failure, SAML error, Kerberos error, certificate error, SSL/TLS error, DNS failure, network unavailable, connection error, gateway error, captive portal, ZPA error, enrollment error, device posture failure, PAC file error, service crash, unhandled exception, memory error, policy error, access denied, update failure, and generic severity keywords (CRITICAL/FATAL/ERROR/WARN).

---

## Log Files Supported

The tool auto-discovers any `.log` file in the ZIP. Priority is given to known ZCC log types:

- `ZscalerApp.log` — Main application log
- `ZscalerTunnel.log` — Tunnel/forwarding log
- `ZscalerService.log` — Windows service log
- `ZscalerZPA.log` — ZPA private access log
- `ZscalerFallback.log` — Fallback mode log
- `ZscalerUpdater.log` — Auto-update log
- `ZscalerDiagnostics.log` — Diagnostics log
- `ZscalerZDX.log` — ZDX digital experience log
- `ZscalerCrash.log` — Crash reports
- `ZscalerNetworkExtension.log` — macOS Network Extension
- `ZscalerSystemExtension.log` — macOS System Extension
- `ZscalerPAC.log`, `ZscalerProxy.log`, `ZscalerAgent.log`
- `ZscalerMDM.log`, `ZscalerDLP.log`, `ZscalerBrowser.log`
- Rotated logs: `ZscalerApp.log.1`, `ZscalerApp.log.2`, etc.

---

## Timestamp Formats Handled

| Format | Example |
|---|---|
| ISO 8601 with timezone | `2024-01-15T10:23:45.123Z` |
| ISO 8601 without timezone | `2024-01-15T10:23:45.123` |
| Common datetime | `2024-01-15 10:23:45.123` |
| Slash-separated | `2024/01/15 10:23:45` |
| Syslog style | `Jan 15 10:23:45` |
| Time-only | `10:23:45.123` |
| Unix epoch (seconds) | `1705312345` |
| Unix epoch (milliseconds) | `1705312345123` |

---

## Spike Detection Algorithm

1. All timestamped events are sorted chronologically
2. Events are bucketed into N-minute windows (default: 5 minutes)
3. The average events-per-window is calculated across all windows
4. A window is flagged as a **spike** if:
   - Its count ≥ `spike_min` (absolute floor, default: 10), **AND**
   - Its count ≥ average × `spike_threshold` (default: 2.0×)
5. Spike windows are highlighted in the HTML chart (yellow bars) and listed in a dedicated section with source file attribution and category breakdown

---

## Baseline Diff Algorithm

1. Both ZIPs are extracted and parsed with the same settings
2. Error code frequencies are computed for each
3. For each code appearing in either set:
   - **New**: appears in incident, not in baseline
   - **Resolved**: appears in baseline, not in incident
   - **Increased**: incident/baseline ratio ≥ `increase_threshold` (default: 1.5×)
   - **Decreased**: incident/baseline ratio ≤ `decrease_threshold` (default: 0.5×)
   - **Unchanged**: within normal variation
4. File-level diff shows new/missing log files between the two ZIPs
5. Event rate comparison shows overall events/minute change

---

## Project Structure

```
zcc-log-analyzer/
├── zcc_analyzer.py          # CLI entry point
├── requirements.txt
├── README.md
├── modules/
│   ├── __init__.py
│   ├── error_codes.py       # ZCC error code database (60+ codes, 25 patterns)
│   ├── extractor.py         # ZIP extraction & log file discovery
│   ├── parser.py            # Multi-format log line parser
│   ├── timeline.py          # Chronological sorting & spike detection
│   ├── baseline.py          # Baseline ZIP diffing engine
│   └── reporter.py          # Console (rich) + HTML (Jinja2) report generation
└── templates/
    └── report.html.j2       # Dark-mode HTML report template with Chart.js
```

---

## HTML Report Sections

1. **Executive Summary** — Total events, severity breakdown, time range, event rate, spike count
2. **⚡ Activity Spike Windows** — Each spike window with timestamp, count, ratio, source files, and top categories
3. **📈 Event Timeline** — Chart.js bar chart with spike windows highlighted in yellow
4. **🔢 Error Code Frequency** — Searchable table of all matched error codes sorted by frequency
5. **📋 Chronological Event Log** — Filterable table of all events (WARNING+) with severity, source file, code, and message
6. **📁 Log File Breakdown** — Per-file event counts with severity distribution bars
7. **🔍 Baseline Diff** *(if `--baseline` provided)* — New/resolved/increased/decreased errors, file diff, rate comparison, full diff table

---

## Requirements

- Python 3.10+
- `rich` ≥ 13.0 (console output)
- `jinja2` ≥ 3.1 (HTML reports)
- `python-dateutil` ≥ 2.8 (timestamp parsing)
- No external network access required at runtime (Chart.js loaded from CDN in HTML reports)

---

## References

- [Zscaler Client Connector Errors](https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-errors)
- [ZCC Connection Status Errors](https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-connection-status-errors)
- [ZCC ZPA Authentication Errors](https://help.zscaler.com/zscaler-client-connector/zscaler-client-connector-zpa-authentication-errors)
- [ZCC Troubleshooting](https://help.zscaler.com/zscaler-client-connector/troubleshooting)
