#!/usr/bin/env python3
"""
zcc_analyzer.py
===============
Zscaler Client Connector Log Analyzer — CLI Entry Point

Usage examples:
  # Basic analysis (console + HTML report)
  python zcc_analyzer.py --log incident.zip

  # Console output only
  python zcc_analyzer.py --log incident.zip --format console

  # HTML report only, custom output path
  python zcc_analyzer.py --log incident.zip --format html --output report.html

  # With baseline comparison
  python zcc_analyzer.py --log incident.zip --baseline baseline.zip

  # Custom spike detection settings
  python zcc_analyzer.py --log incident.zip --spike-window 3 --spike-threshold 3.0 --spike-min 5

  # Include INFO-level events
  python zcc_analyzer.py --log incident.zip --min-severity INFO

  # Verbose logging
  python zcc_analyzer.py --log incident.zip --verbose
"""

import argparse
import logging
import os
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
def setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    # Suppress noisy third-party loggers
    logging.getLogger("urllib3").setLevel(logging.ERROR)
    logging.getLogger("charset_normalizer").setLevel(logging.ERROR)


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="zcc_analyzer",
        description=(
            "Zscaler Client Connector Log Analyzer\n"
            "Scans ZCC log ZIP archives for errors, consolidates them\n"
            "chronologically, detects activity spikes, and generates reports."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --log incident.zip
  %(prog)s --log incident.zip --baseline baseline.zip
  %(prog)s --log incident.zip --format html --output report.html
  %(prog)s --log incident.zip --spike-window 3 --spike-threshold 3.0
  %(prog)s --log incident.zip --min-severity ERROR --format console
        """,
    )

    # ---- Input ----
    input_group = parser.add_argument_group("Input")
    input_group.add_argument(
        "--log", "-l",
        required=True,
        metavar="INCIDENT.ZIP",
        help="Path to the ZCC log ZIP archive to analyze.",
    )
    input_group.add_argument(
        "--baseline", "-b",
        metavar="BASELINE.ZIP",
        default=None,
        help=(
            "Path to a baseline ZCC log ZIP for comparison. "
            "When provided, the report includes a diff section showing "
            "new, resolved, and frequency-changed errors."
        ),
    )

    # ---- Output ----
    output_group = parser.add_argument_group("Output")
    output_group.add_argument(
        "--output", "-o",
        metavar="REPORT.HTML",
        default=None,
        help=(
            "Output path for the HTML report. "
            "If not specified, auto-generates a filename like "
            "zcc_report_<name>_<timestamp>.html in the current directory."
        ),
    )
    output_group.add_argument(
        "--format", "-f",
        choices=["console", "html", "both"],
        default="both",
        help=(
            "Output format: 'console' (rich terminal output), "
            "'html' (HTML report only), or 'both' (default)."
        ),
    )
    output_group.add_argument(
        "--max-events",
        type=int,
        default=200,
        metavar="N",
        help="Maximum events to display in console output (default: 200).",
    )

    # ---- Filtering ----
    filter_group = parser.add_argument_group("Filtering")
    filter_group.add_argument(
        "--min-severity",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        default="WARNING",
        help=(
            "Minimum severity level to include in the report (default: WARNING). "
            "Use DEBUG to capture all log lines."
        ),
    )
    filter_group.add_argument(
        "--show-unmatched",
        action="store_true",
        default=False,
        help="Include events that didn't match any known error code in the frequency table.",
    )

    # ---- Spike detection ----
    spike_group = parser.add_argument_group("Spike Detection")
    spike_group.add_argument(
        "--spike-window",
        type=int,
        default=5,
        metavar="MINUTES",
        help="Time window size in minutes for spike detection (default: 5).",
    )
    spike_group.add_argument(
        "--spike-threshold",
        type=float,
        default=2.0,
        metavar="MULTIPLIER",
        help=(
            "A window is flagged as a spike if its event count exceeds "
            "average × MULTIPLIER (default: 2.0)."
        ),
    )
    spike_group.add_argument(
        "--spike-min",
        type=int,
        default=10,
        metavar="COUNT",
        help=(
            "Minimum absolute event count for a window to be considered a spike "
            "(prevents false positives on low-traffic logs). Default: 10."
        ),
    )

    # ---- Baseline diff options ----
    diff_group = parser.add_argument_group("Baseline Diff Options")
    diff_group.add_argument(
        "--increase-threshold",
        type=float,
        default=1.5,
        metavar="RATIO",
        help=(
            "Ratio (incident/baseline) above which an error is flagged as "
            "'increased frequency' (default: 1.5 = 50%% increase)."
        ),
    )
    diff_group.add_argument(
        "--decrease-threshold",
        type=float,
        default=0.5,
        metavar="RATIO",
        help=(
            "Ratio (incident/baseline) below which an error is flagged as "
            "'decreased frequency' (default: 0.5 = 50%% decrease)."
        ),
    )

    # ---- Misc ----
    misc_group = parser.add_argument_group("Miscellaneous")
    misc_group.add_argument(
        "--verbose", "-v",
        action="store_true",
        default=False,
        help="Enable verbose debug logging.",
    )
    misc_group.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0.0",
    )
    misc_group.add_argument(
        "--list-codes",
        action="store_true",
        default=False,
        help="Print all known ZCC error codes and exit.",
    )

    return parser


# ---------------------------------------------------------------------------
# List known error codes
# ---------------------------------------------------------------------------
def list_error_codes() -> None:
    from modules.error_codes import ALL_ERROR_CODES, KEYWORD_PATTERNS

    try:
        from rich.console import Console
        from rich.table import Table
        from rich import box
        console = Console()
        table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
        table.add_column("Code", min_width=20)
        table.add_column("Category", min_width=18)
        table.add_column("Severity", justify="center")
        table.add_column("Message", max_width=60)

        for code, ec in sorted(ALL_ERROR_CODES.items()):
            sev_styles = {
                "CRITICAL": "bold red",
                "ERROR": "red",
                "WARNING": "yellow",
                "INFO": "cyan",
            }
            style = sev_styles.get(ec.severity, "")
            table.add_row(
                code,
                ec.category,
                f"[{style}]{ec.severity}[/{style}]",
                ec.message[:60],
            )

        console.print(f"\n[bold]ZCC Error Code Database[/bold] — {len(ALL_ERROR_CODES)} codes\n")
        console.print(table)
        console.print(f"\n[dim]+ {len(KEYWORD_PATTERNS)} keyword pattern rules[/dim]\n")

    except ImportError:
        print(f"\nZCC Error Code Database — {len(ALL_ERROR_CODES)} codes\n")
        print(f"{'Code':<25} {'Category':<22} {'Severity':<10} Message")
        print("-" * 90)
        for code, ec in sorted(ALL_ERROR_CODES.items()):
            print(f"{code:<25} {ec.category:<22} {ec.severity:<10} {ec.message[:50]}")
        print(f"\n+ {len(KEYWORD_PATTERNS)} keyword pattern rules\n")


# ---------------------------------------------------------------------------
# Main analysis pipeline
# ---------------------------------------------------------------------------
def run_analysis(args: argparse.Namespace) -> int:
    """
    Execute the full analysis pipeline.

    Returns exit code (0 = success, 1 = error).
    """
    from modules.extractor import extract_logs
    from modules.parser import parse_logs
    from modules.timeline import build_timeline
    from modules.reporter import generate_report

    logger = logging.getLogger(__name__)

    # ---- Validate inputs ----
    if not os.path.exists(args.log):
        print(f"ERROR: Log file not found: {args.log}", file=sys.stderr)
        return 1

    if args.baseline and not os.path.exists(args.baseline):
        print(f"ERROR: Baseline file not found: {args.baseline}", file=sys.stderr)
        return 1

    # ---- Extract incident logs ----
    _print_step("Extracting incident logs…")
    incident_result = extract_logs(args.log)

    if not incident_result.log_files:
        print(
            f"ERROR: No log files found in {args.log}. "
            "Ensure the ZIP contains .log files.",
            file=sys.stderr,
        )
        if incident_result.errors:
            for err in incident_result.errors:
                print(f"  {err}", file=sys.stderr)
        return 1

    _print_step(
        f"Found {incident_result.file_count} log files "
        f"({incident_result.total_size / 1024:.1f} KB)"
    )

    # ---- Parse incident logs ----
    _print_step(f"Parsing logs (min severity: {args.min_severity})…")
    incident_events = parse_logs(
        incident_result.log_files,
        min_severity=args.min_severity,
    )
    _print_step(f"Parsed {len(incident_events)} events")

    # ---- Build incident timeline ----
    _print_step(
        f"Building timeline (window: {args.spike_window}min, "
        f"spike threshold: {args.spike_threshold}x)…"
    )
    incident_timeline = build_timeline(
        incident_events,
        window_minutes=args.spike_window,
        spike_threshold_multiplier=args.spike_threshold,
        spike_min_count=args.spike_min,
    )

    if incident_timeline.has_spikes:
        _print_step(
            f"⚡ {len(incident_timeline.spike_windows)} spike window(s) detected!",
            level="warn",
        )

    # ---- Baseline comparison (optional) ----
    baseline_diff = None
    baseline_source = None

    if args.baseline:
        from modules.baseline import diff_baseline

        _print_step("Extracting baseline logs…")
        baseline_result = extract_logs(args.baseline)

        if not baseline_result.log_files:
            print(
                f"WARNING: No log files found in baseline {args.baseline}. "
                "Skipping baseline comparison.",
                file=sys.stderr,
            )
        else:
            _print_step(
                f"Found {baseline_result.file_count} baseline log files"
            )
            _print_step("Parsing baseline logs…")
            baseline_events = parse_logs(
                baseline_result.log_files,
                min_severity=args.min_severity,
            )
            _print_step(f"Parsed {len(baseline_events)} baseline events")

            _print_step("Building baseline timeline…")
            baseline_timeline = build_timeline(
                baseline_events,
                window_minutes=args.spike_window,
                spike_threshold_multiplier=args.spike_threshold,
                spike_min_count=args.spike_min,
            )

            _print_step("Computing baseline diff…")
            baseline_diff = diff_baseline(
                incident_timeline=incident_timeline,
                baseline_timeline=baseline_timeline,
                incident_log_files=[f.name for f in incident_result.log_files],
                baseline_log_files=[f.name for f in baseline_result.log_files],
                increase_threshold=args.increase_threshold,
                decrease_threshold=args.decrease_threshold,
            )
            baseline_source = args.baseline

            _print_step(
                f"Diff: {len(baseline_diff.new_codes)} new, "
                f"{len(baseline_diff.resolved_codes)} resolved, "
                f"{len(baseline_diff.increased_codes)} increased"
            )

    # ---- Generate report ----
    _print_step("Generating report…")

    all_extraction_errors = list(incident_result.errors)
    if incident_result.skipped_files:
        all_extraction_errors.append(
            f"Skipped {len(incident_result.skipped_files)} non-log files"
        )

    html_path = generate_report(
        timeline=incident_timeline,
        source_path=args.log,
        output_path=args.output,
        output_format=args.format,
        baseline_diff=baseline_diff,
        baseline_source_path=baseline_source,
        extraction_errors=all_extraction_errors if all_extraction_errors else None,
        max_console_events=args.max_events,
    )

    if html_path:
        _print_step(f"HTML report saved: {html_path}", level="success")
        # Try to open in browser on macOS/Linux
        if sys.platform == "darwin":
            try:
                import subprocess
                subprocess.Popen(["open", html_path])
            except Exception:
                pass

    return 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _print_step(msg: str, level: str = "info") -> None:
    """Print a progress step to stderr (so it doesn't pollute stdout)."""
    try:
        from rich.console import Console
        console = Console(stderr=True)
        icons = {"info": "[dim]→[/dim]", "warn": "[yellow]⚠[/yellow]", "success": "[green]✓[/green]"}
        icon = icons.get(level, "→")
        console.print(f"  {icon} {msg}")
    except ImportError:
        prefix = {"info": "  →", "warn": "  ⚠", "success": "  ✓"}.get(level, "  →")
        print(f"{prefix} {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    setup_logging(verbose=args.verbose)

    if args.list_codes:
        list_error_codes()
        return 0

    return run_analysis(args)


if __name__ == "__main__":
    sys.exit(main())
