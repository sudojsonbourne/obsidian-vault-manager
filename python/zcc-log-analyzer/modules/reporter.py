"""
reporter.py
===========
Report generation for ZCC log analysis results.

Supports two output formats:
  1. Console output using the `rich` library (color-coded, tables, panels)
  2. HTML report using Jinja2 templating with embedded Chart.js

Both formats include:
  - Executive summary
  - Severity breakdown
  - Spike window highlights
  - Chronological event log
  - Error code frequency table
  - Per-log-file breakdown
  - Baseline diff section (if baseline provided)
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .error_codes import Severity, SEVERITY_COLORS, get_severity_rank, ALL_ERROR_CODES
from .timeline import TimelineResult, SpikeWindow, format_duration
from .baseline import BaselineDiffResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rich console reporter
# ---------------------------------------------------------------------------

def _get_rich():
    """Lazy import of rich to avoid hard dependency at module load."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich.panel import Panel
        from rich.text import Text
        from rich import box
        return Console, Table, Panel, Text, box
    except ImportError:
        return None, None, None, None, None


SEVERITY_RICH_STYLES = {
    Severity.CRITICAL: "bold red",
    Severity.ERROR:    "red",
    Severity.WARNING:  "yellow",
    Severity.INFO:     "cyan",
    Severity.DEBUG:    "dim",
}


class ConsoleReporter:
    """
    Renders analysis results to the terminal using the `rich` library.
    Falls back to plain text if `rich` is not installed.
    """

    def __init__(self, max_events: int = 200, show_unmatched: bool = False):
        self.max_events = max_events
        self.show_unmatched = show_unmatched

    def report(
        self,
        timeline: TimelineResult,
        source_path: str,
        baseline_diff: Optional[BaselineDiffResult] = None,
        extraction_errors: Optional[list[str]] = None,
    ) -> None:
        Console, Table, Panel, Text, box = _get_rich()

        if Console is None:
            self._plain_report(timeline, source_path, baseline_diff)
            return

        console = Console()

        # ---- Header ----
        console.print()
        console.rule("[bold blue]ZCC Log Analyzer Report[/bold blue]")
        console.print(f"[dim]Source:[/dim] {source_path}")
        console.print(f"[dim]Generated:[/dim] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        console.print()

        # ---- Executive Summary ----
        self._print_summary(console, Panel, Text, timeline)

        # ---- Extraction errors ----
        if extraction_errors:
            console.print(Panel(
                "\n".join(f"[yellow]⚠[/yellow] {e}" for e in extraction_errors),
                title="[yellow]Extraction Warnings[/yellow]",
                border_style="yellow",
            ))

        # ---- Spike windows ----
        if timeline.has_spikes:
            self._print_spikes(console, Table, Panel, box, timeline)

        # ---- Error frequency table ----
        self._print_frequency_table(console, Table, box, timeline)

        # ---- Chronological event log ----
        self._print_event_log(console, Table, box, timeline)

        # ---- Baseline diff ----
        if baseline_diff:
            self._print_baseline_diff(console, Table, Panel, box, baseline_diff)

        console.rule("[dim]End of Report[/dim]")
        console.print()

    def _print_summary(self, console, Panel, Text, timeline: TimelineResult) -> None:
        sev = timeline.severity_summary
        total = timeline.total_events

        lines = []
        lines.append(f"Total events:    [bold]{total}[/bold]")
        if timeline.time_range_start:
            lines.append(
                f"Time range:      {timeline.time_range_start.strftime('%Y-%m-%d %H:%M:%S')} → "
                f"{timeline.time_range_end.strftime('%Y-%m-%d %H:%M:%S')} UTC"
            )
        lines.append(f"Duration:        {format_duration(timeline.duration_minutes)}")
        if timeline.events_per_minute:
            lines.append(f"Event rate:      {timeline.events_per_minute:.1f} events/min")
        lines.append("")
        lines.append(f"[bold red]CRITICAL:[/bold red]  {sev.get(Severity.CRITICAL, 0)}")
        lines.append(f"[red]ERROR:[/red]     {sev.get(Severity.ERROR, 0)}")
        lines.append(f"[yellow]WARNING:[/yellow]   {sev.get(Severity.WARNING, 0)}")
        lines.append(f"[cyan]INFO:[/cyan]      {sev.get(Severity.INFO, 0)}")

        if timeline.has_spikes:
            lines.append("")
            lines.append(
                f"[bold yellow]⚡ {len(timeline.spike_windows)} activity spike(s) detected![/bold yellow]"
            )

        console.print(Panel(
            "\n".join(lines),
            title="[bold]Executive Summary[/bold]",
            border_style="blue",
        ))

    def _print_spikes(self, console, Table, Panel, box, timeline: TimelineResult) -> None:
        console.print()
        console.print(Panel(
            f"[bold yellow]⚡ {len(timeline.spike_windows)} Spike Window(s) Detected[/bold yellow]\n"
            f"Window size: {timeline.window_minutes} minutes | "
            f"Threshold: {timeline.spike_threshold_multiplier}x average or "
            f"{timeline.spike_min_count} events minimum",
            border_style="yellow",
        ))

        table = Table(box=box.ROUNDED, show_header=True, header_style="bold yellow")
        table.add_column("Time Window", style="yellow", min_width=22)
        table.add_column("Events", justify="right", style="bold")
        table.add_column("Ratio", justify="right")
        table.add_column("Max Severity", justify="center")
        table.add_column("Source Files")
        table.add_column("Top Categories")

        for sw in timeline.spike_windows:
            sev_style = SEVERITY_RICH_STYLES.get(sw.max_severity, "")
            cats = ", ".join(f"{c}({n})" for c, n in sw.top_categories[:3])
            table.add_row(
                sw.label,
                str(sw.count),
                f"{sw.spike_ratio:.1f}x",
                f"[{sev_style}]{sw.max_severity}[/{sev_style}]",
                ", ".join(sw.source_files[:3]),
                cats,
            )

        console.print(table)

    def _print_frequency_table(self, console, Table, box, timeline: TimelineResult) -> None:
        console.print()
        console.rule("[bold]Error Code Frequency[/bold]")

        table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
        table.add_column("Code", min_width=20)
        table.add_column("Category", min_width=18)
        table.add_column("Count", justify="right")
        table.add_column("Severity", justify="center")
        table.add_column("Description", max_width=50)

        # Build frequency from events
        code_counts: dict[str, dict] = {}
        for ev in timeline.events:
            key = ev.matched_code or f"UNMATCHED_{ev.severity}"
            if key not in code_counts:
                code_counts[key] = {
                    "code": key,
                    "category": ev.matched_category or "Unmatched",
                    "message": ev.matched_message or ev.message[:60],
                    "count": 0,
                    "severity": ev.severity,
                }
            code_counts[key]["count"] += 1

        # Sort by count desc
        sorted_codes = sorted(code_counts.values(), key=lambda x: -x["count"])

        for item in sorted_codes[:50]:  # Top 50
            if not self.show_unmatched and item["code"].startswith("UNMATCHED_"):
                continue
            sev_style = SEVERITY_RICH_STYLES.get(item["severity"], "")
            table.add_row(
                item["code"],
                item["category"],
                str(item["count"]),
                f"[{sev_style}]{item['severity']}[/{sev_style}]",
                item["message"][:60],
            )

        console.print(table)

    def _print_event_log(self, console, Table, box, timeline: TimelineResult) -> None:
        console.print()
        console.rule(f"[bold]Chronological Event Log (showing up to {self.max_events})[/bold]")

        table = Table(box=box.SIMPLE, show_header=True, header_style="bold dim")
        table.add_column("Timestamp", min_width=22, style="dim")
        table.add_column("Sev", width=8, justify="center")
        table.add_column("Source", min_width=18)
        table.add_column("Code", min_width=16)
        table.add_column("Message", max_width=70)

        # Filter to errors/warnings/critical for the event log
        display_events = [
            e for e in timeline.events
            if get_severity_rank(e.severity) >= get_severity_rank(Severity.WARNING)
        ][:self.max_events]

        for ev in display_events:
            sev_style = SEVERITY_RICH_STYLES.get(ev.severity, "")
            ts = ev.timestamp.strftime("%Y-%m-%d %H:%M:%S") if ev.timestamp else ev.timestamp_raw or "—"
            table.add_row(
                ts,
                f"[{sev_style}]{ev.severity[:4]}[/{sev_style}]",
                ev.source_file,
                ev.matched_code or "—",
                ev.message[:70],
            )

        console.print(table)

        if len(timeline.events) > self.max_events:
            console.print(
                f"[dim]... and {len(timeline.events) - self.max_events} more events "
                f"(use --output to see full HTML report)[/dim]"
            )

    def _print_baseline_diff(self, console, Table, Panel, box, diff: BaselineDiffResult) -> None:
        console.print()
        console.rule("[bold magenta]Baseline Comparison[/bold magenta]")
        console.print(diff.summary_text())

        if diff.new_codes:
            console.print()
            console.print("[bold red]🆕 New Errors (not in baseline):[/bold red]")
            table = Table(box=box.SIMPLE, show_header=True, header_style="bold red")
            table.add_column("Code")
            table.add_column("Category")
            table.add_column("Count", justify="right")
            table.add_column("Severity")
            table.add_column("Description", max_width=50)
            for e in diff.new_codes[:20]:
                sev_style = SEVERITY_RICH_STYLES.get(e.severity, "")
                table.add_row(
                    e.code, e.category, str(e.incident_count),
                    f"[{sev_style}]{e.severity}[/{sev_style}]",
                    e.message[:50],
                )
            console.print(table)

        if diff.resolved_codes:
            console.print()
            console.print("[bold green]✅ Resolved Errors (in baseline, not in incident):[/bold green]")
            for e in diff.resolved_codes[:10]:
                console.print(f"  [green]✓[/green] {e.code} — {e.message} (was {e.baseline_count}x)")

        if diff.increased_codes:
            console.print()
            console.print("[bold yellow]⬆ Increased Frequency:[/bold yellow]")
            for e in diff.increased_codes[:10]:
                console.print(
                    f"  [yellow]↑[/yellow] {e.code}: {e.baseline_count} → {e.incident_count} "
                    f"({e.change_label})"
                )

    def _plain_report(
        self,
        timeline: TimelineResult,
        source_path: str,
        baseline_diff: Optional[BaselineDiffResult],
    ) -> None:
        """Fallback plain-text report when rich is not available."""
        print("\n" + "=" * 70)
        print("ZCC LOG ANALYZER REPORT")
        print("=" * 70)
        print(f"Source: {source_path}")
        print(f"Total events: {timeline.total_events}")
        sev = timeline.severity_summary
        print(f"CRITICAL: {sev.get(Severity.CRITICAL, 0)}")
        print(f"ERROR:    {sev.get(Severity.ERROR, 0)}")
        print(f"WARNING:  {sev.get(Severity.WARNING, 0)}")

        if timeline.has_spikes:
            print(f"\n⚡ {len(timeline.spike_windows)} SPIKE WINDOW(S) DETECTED:")
            for sw in timeline.spike_windows:
                print(f"  {sw.label}: {sw.count} events ({sw.spike_ratio:.1f}x average)")

        print("\nTop Error Codes:")
        for code, count in timeline.top_error_codes[:20]:
            ec = ALL_ERROR_CODES.get(code)
            msg = ec.message if ec else code
            print(f"  {count:4d}x  {code:25s}  {msg[:50]}")

        if baseline_diff:
            print("\n" + baseline_diff.summary_text())

        print("=" * 70)


# ---------------------------------------------------------------------------
# HTML reporter
# ---------------------------------------------------------------------------

class HtmlReporter:
    """
    Generates a self-contained HTML report using Jinja2.
    """

    def __init__(self, template_dir: Optional[str] = None):
        if template_dir is None:
            template_dir = str(Path(__file__).parent.parent / "templates")
        self.template_dir = template_dir

    def render(
        self,
        timeline: TimelineResult,
        source_path: str,
        output_path: str,
        baseline_diff: Optional[BaselineDiffResult] = None,
        extraction_errors: Optional[list[str]] = None,
        baseline_source_path: Optional[str] = None,
    ) -> str:
        """
        Render the HTML report and write it to output_path.

        Returns the output path.
        """
        try:
            from jinja2 import Environment, FileSystemLoader, select_autoescape
        except ImportError:
            raise ImportError(
                "jinja2 is required for HTML reports. "
                "Install it with: pip install jinja2"
            )

        env = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=select_autoescape(["html"]),
        )

        # Add custom filters
        env.filters["severity_color"] = lambda s: SEVERITY_COLORS.get(s, "#6b7280")
        env.filters["format_ts"] = lambda dt: (
            dt.strftime("%Y-%m-%d %H:%M:%S UTC") if dt else "—"
        )
        env.filters["truncate_msg"] = lambda s, n=80: (s[:n] + "…") if len(s) > n else s

        template = env.get_template("report.html.j2")

        # Prepare chart data
        chart_data = timeline.chart_data()

        # Prepare event data for the table (limit to 2000 for HTML performance)
        display_events = [
            e for e in timeline.events
            if get_severity_rank(e.severity) >= get_severity_rank(Severity.WARNING)
        ][:2000]

        # Build frequency table
        code_freq: dict[str, dict] = {}
        for ev in timeline.events:
            key = ev.matched_code or f"UNMATCHED_{ev.severity}"
            if key not in code_freq:
                code_freq[key] = {
                    "code": key,
                    "category": ev.matched_category or "Unmatched",
                    "message": ev.matched_message or ev.message[:80],
                    "count": 0,
                    "severity": ev.severity,
                }
            code_freq[key]["count"] += 1

        sorted_freq = sorted(code_freq.values(), key=lambda x: -x["count"])

        # Per-file breakdown
        file_breakdown: dict[str, dict] = {}
        for ev in timeline.events:
            fn = ev.source_file
            if fn not in file_breakdown:
                file_breakdown[fn] = {
                    "name": fn,
                    "log_type": ev.log_type,
                    "total": 0,
                    "critical": 0,
                    "error": 0,
                    "warning": 0,
                    "info": 0,
                }
            file_breakdown[fn]["total"] += 1
            sev_key = ev.severity.lower()
            if sev_key in file_breakdown[fn]:
                file_breakdown[fn][sev_key] += 1

        sorted_files = sorted(file_breakdown.values(), key=lambda x: -x["total"])

        context = {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "source_path": source_path,
            "baseline_source_path": baseline_source_path,
            "timeline": timeline,
            "severity": Severity,
            "severity_colors": SEVERITY_COLORS,
            "chart_data_json": json.dumps(chart_data),
            "display_events": display_events,
            "code_freq": sorted_freq[:100],
            "file_breakdown": sorted_files,
            "spike_windows": timeline.spike_windows,
            "baseline_diff": baseline_diff,
            "extraction_errors": extraction_errors or [],
            "format_duration": format_duration,
            "get_severity_rank": get_severity_rank,
            "all_error_codes": ALL_ERROR_CODES,
        }

        html_content = template.render(**context)

        output_path = str(output_path)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        logger.info(f"HTML report written to: {output_path}")
        return output_path


# ---------------------------------------------------------------------------
# Unified report function
# ---------------------------------------------------------------------------

def generate_report(
    timeline: TimelineResult,
    source_path: str,
    output_path: Optional[str] = None,
    output_format: str = "both",
    baseline_diff: Optional[BaselineDiffResult] = None,
    baseline_source_path: Optional[str] = None,
    extraction_errors: Optional[list[str]] = None,
    max_console_events: int = 200,
) -> Optional[str]:
    """
    Generate analysis report in the specified format.

    Parameters
    ----------
    timeline : TimelineResult
    source_path : str
        Path to the source ZIP file (for display).
    output_path : str, optional
        Path for HTML output file. If None and format includes HTML,
        auto-generates a filename.
    output_format : str
        One of: "console", "html", "both" (default: "both").
    baseline_diff : BaselineDiffResult, optional
    baseline_source_path : str, optional
    extraction_errors : list[str], optional
    max_console_events : int
        Maximum events to show in console output (default: 200).

    Returns
    -------
    str or None
        Path to the HTML report if generated, else None.
    """
    html_path = None

    if output_format in ("console", "both"):
        reporter = ConsoleReporter(max_events=max_console_events)
        reporter.report(
            timeline=timeline,
            source_path=source_path,
            baseline_diff=baseline_diff,
            extraction_errors=extraction_errors,
        )

    if output_format in ("html", "both"):
        if output_path is None:
            # Auto-generate output filename
            base = Path(source_path).stem
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = f"zcc_report_{base}_{ts}.html"

        html_reporter = HtmlReporter()
        try:
            html_path = html_reporter.render(
                timeline=timeline,
                source_path=source_path,
                output_path=output_path,
                baseline_diff=baseline_diff,
                extraction_errors=extraction_errors,
                baseline_source_path=baseline_source_path,
            )
        except ImportError as e:
            logger.warning(f"HTML report skipped: {e}")

    return html_path
