"""
baseline.py
===========
Baseline ZIP comparison and diff engine for ZCC log analysis.

Compares an incident log bundle against a baseline log bundle to identify:
  - New error codes that don't appear in the baseline
  - Resolved errors (in baseline but not in incident)
  - Frequency changes (errors that increased or decreased significantly)
  - New log files present in incident but not baseline
  - Missing log files (in baseline but not in incident)
  - Timeline comparison (incident vs baseline event rate)
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .parser import LogEvent
from .timeline import TimelineResult
from .error_codes import ALL_ERROR_CODES, Severity, get_severity_rank

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class CodeFrequency:
    """Frequency of a specific error code or pattern."""
    code: str
    category: str
    message: str
    count: int
    severity: str = Severity.INFO
    sample_events: list[LogEvent] = field(default_factory=list)  # Up to 3 samples

    @property
    def severity_rank(self) -> int:
        return get_severity_rank(self.severity)


@dataclass
class DiffEntry:
    """A single diff entry comparing baseline vs incident."""
    code: str
    category: str
    message: str
    severity: str
    baseline_count: int
    incident_count: int
    change_type: str        # "new", "resolved", "increased", "decreased", "unchanged"
    change_ratio: float     # incident/baseline ratio (inf if baseline=0)
    sample_events: list[LogEvent] = field(default_factory=list)

    @property
    def is_new(self) -> bool:
        return self.change_type == "new"

    @property
    def is_resolved(self) -> bool:
        return self.change_type == "resolved"

    @property
    def is_increased(self) -> bool:
        return self.change_type == "increased"

    @property
    def is_decreased(self) -> bool:
        return self.change_type == "decreased"

    @property
    def severity_rank(self) -> int:
        return get_severity_rank(self.severity)

    @property
    def change_label(self) -> str:
        if self.change_type == "new":
            return "🆕 NEW"
        if self.change_type == "resolved":
            return "✅ RESOLVED"
        if self.change_type == "increased":
            pct = int((self.change_ratio - 1) * 100)
            return f"⬆ +{pct}%"
        if self.change_type == "decreased":
            pct = int((1 - self.change_ratio) * 100)
            return f"⬇ -{pct}%"
        return "— UNCHANGED"

    @property
    def change_html_class(self) -> str:
        return {
            "new":       "diff-new",
            "resolved":  "diff-resolved",
            "increased": "diff-increased",
            "decreased": "diff-decreased",
            "unchanged": "diff-unchanged",
        }.get(self.change_type, "")


@dataclass
class BaselineDiffResult:
    """Complete result of a baseline comparison."""
    # Summary counts
    new_codes: list[DiffEntry] = field(default_factory=list)
    resolved_codes: list[DiffEntry] = field(default_factory=list)
    increased_codes: list[DiffEntry] = field(default_factory=list)
    decreased_codes: list[DiffEntry] = field(default_factory=list)
    unchanged_codes: list[DiffEntry] = field(default_factory=list)

    # File-level diff
    new_log_files: list[str] = field(default_factory=list)
    missing_log_files: list[str] = field(default_factory=list)
    common_log_files: list[str] = field(default_factory=list)

    # Rate comparison
    baseline_events_per_minute: Optional[float] = None
    incident_events_per_minute: Optional[float] = None
    baseline_total_events: int = 0
    incident_total_events: int = 0

    # Severity distribution comparison
    baseline_severity_dist: dict[str, int] = field(default_factory=dict)
    incident_severity_dist: dict[str, int] = field(default_factory=dict)

    @property
    def all_entries(self) -> list[DiffEntry]:
        """All diff entries sorted by severity then change type priority."""
        all_e = (
            self.new_codes +
            self.increased_codes +
            self.resolved_codes +
            self.decreased_codes +
            self.unchanged_codes
        )
        # Sort: new/increased first, then by severity rank desc
        priority = {"new": 0, "increased": 1, "resolved": 2, "decreased": 3, "unchanged": 4}
        return sorted(
            all_e,
            key=lambda e: (priority.get(e.change_type, 5), -e.severity_rank)
        )

    @property
    def has_regressions(self) -> bool:
        """True if there are new or significantly increased errors."""
        return bool(self.new_codes or self.increased_codes)

    @property
    def has_improvements(self) -> bool:
        """True if there are resolved or decreased errors."""
        return bool(self.resolved_codes or self.decreased_codes)

    @property
    def rate_change_pct(self) -> Optional[float]:
        """Percentage change in events per minute (incident vs baseline)."""
        if (
            self.baseline_events_per_minute is not None
            and self.incident_events_per_minute is not None
            and self.baseline_events_per_minute > 0
        ):
            return (
                (self.incident_events_per_minute - self.baseline_events_per_minute)
                / self.baseline_events_per_minute
            ) * 100
        return None

    def summary_text(self) -> str:
        lines = [
            "=== Baseline Comparison Summary ===",
            f"  New errors (not in baseline):     {len(self.new_codes)}",
            f"  Resolved errors (gone in incident): {len(self.resolved_codes)}",
            f"  Increased frequency:               {len(self.increased_codes)}",
            f"  Decreased frequency:               {len(self.decreased_codes)}",
            f"  New log files in incident:         {len(self.new_log_files)}",
            f"  Missing log files in incident:     {len(self.missing_log_files)}",
        ]
        if self.rate_change_pct is not None:
            sign = "+" if self.rate_change_pct >= 0 else ""
            lines.append(
                f"  Event rate change:                {sign}{self.rate_change_pct:.1f}%"
            )
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Baseline differ
# ---------------------------------------------------------------------------

class BaselineDiffer:
    """
    Compares incident log events against baseline log events.

    Parameters
    ----------
    increase_threshold : float
        Minimum ratio (incident/baseline) to flag as "increased" (default: 1.5 = 50% increase).
    decrease_threshold : float
        Maximum ratio (incident/baseline) to flag as "decreased" (default: 0.5 = 50% decrease).
    min_count_for_change : int
        Minimum count in either set to consider a frequency change significant (default: 3).
    max_samples : int
        Maximum number of sample events to include per diff entry (default: 3).
    """

    def __init__(
        self,
        increase_threshold: float = 1.5,
        decrease_threshold: float = 0.5,
        min_count_for_change: int = 3,
        max_samples: int = 3,
    ):
        self.increase_threshold = increase_threshold
        self.decrease_threshold = decrease_threshold
        self.min_count_for_change = min_count_for_change
        self.max_samples = max_samples

    def diff(
        self,
        incident_timeline: TimelineResult,
        baseline_timeline: TimelineResult,
        incident_log_files: list[str],
        baseline_log_files: list[str],
    ) -> BaselineDiffResult:
        """
        Compare incident events against baseline events.

        Parameters
        ----------
        incident_timeline : TimelineResult
        baseline_timeline : TimelineResult
        incident_log_files : list[str]
            List of log file names in the incident ZIP.
        baseline_log_files : list[str]
            List of log file names in the baseline ZIP.

        Returns
        -------
        BaselineDiffResult
        """
        result = BaselineDiffResult()

        # ---- File-level diff ----
        incident_files_set = set(incident_log_files)
        baseline_files_set = set(baseline_log_files)
        result.new_log_files = sorted(incident_files_set - baseline_files_set)
        result.missing_log_files = sorted(baseline_files_set - incident_files_set)
        result.common_log_files = sorted(incident_files_set & baseline_files_set)

        # ---- Build frequency maps ----
        incident_freq = self._build_frequency_map(incident_timeline.events)
        baseline_freq = self._build_frequency_map(baseline_timeline.events)

        # ---- Rate comparison ----
        result.baseline_events_per_minute = baseline_timeline.events_per_minute
        result.incident_events_per_minute = incident_timeline.events_per_minute
        result.baseline_total_events = baseline_timeline.total_events
        result.incident_total_events = incident_timeline.total_events

        # ---- Severity distribution ----
        result.baseline_severity_dist = baseline_timeline.severity_summary
        result.incident_severity_dist = incident_timeline.severity_summary

        # ---- Code-level diff ----
        all_codes = set(incident_freq.keys()) | set(baseline_freq.keys())

        for code in all_codes:
            inc_freq = incident_freq.get(code)
            base_freq = baseline_freq.get(code)

            inc_count = inc_freq.count if inc_freq else 0
            base_count = base_freq.count if base_freq else 0

            # Determine severity and metadata
            if inc_freq:
                severity = inc_freq.severity
                category = inc_freq.category
                message = inc_freq.message
                samples = inc_freq.sample_events
            else:
                severity = base_freq.severity
                category = base_freq.category
                message = base_freq.message
                samples = []

            # Determine change type
            if base_count == 0 and inc_count > 0:
                change_type = "new"
                ratio = float('inf')
            elif inc_count == 0 and base_count > 0:
                change_type = "resolved"
                ratio = 0.0
            else:
                ratio = inc_count / base_count if base_count > 0 else float('inf')
                if (
                    ratio >= self.increase_threshold
                    and inc_count >= self.min_count_for_change
                ):
                    change_type = "increased"
                elif (
                    ratio <= self.decrease_threshold
                    and base_count >= self.min_count_for_change
                ):
                    change_type = "decreased"
                else:
                    change_type = "unchanged"

            entry = DiffEntry(
                code=code,
                category=category,
                message=message,
                severity=severity,
                baseline_count=base_count,
                incident_count=inc_count,
                change_type=change_type,
                change_ratio=ratio,
                sample_events=samples[:self.max_samples],
            )

            if change_type == "new":
                result.new_codes.append(entry)
            elif change_type == "resolved":
                result.resolved_codes.append(entry)
            elif change_type == "increased":
                result.increased_codes.append(entry)
            elif change_type == "decreased":
                result.decreased_codes.append(entry)
            else:
                result.unchanged_codes.append(entry)

        # Sort each list by severity rank descending, then count descending
        def sort_key(e: DiffEntry):
            return (-e.severity_rank, -e.incident_count)

        result.new_codes.sort(key=sort_key)
        result.resolved_codes.sort(key=lambda e: (-e.severity_rank, -e.baseline_count))
        result.increased_codes.sort(key=lambda e: (-e.change_ratio, -e.severity_rank))
        result.decreased_codes.sort(key=sort_key)
        result.unchanged_codes.sort(key=sort_key)

        logger.info(
            f"Baseline diff: {len(result.new_codes)} new, "
            f"{len(result.resolved_codes)} resolved, "
            f"{len(result.increased_codes)} increased, "
            f"{len(result.decreased_codes)} decreased"
        )

        return result

    def _build_frequency_map(self, events: list[LogEvent]) -> dict[str, CodeFrequency]:
        """
        Build a frequency map from a list of events.
        Keys are matched_code values (or a synthetic key for unmatched events).
        """
        freq_map: dict[str, CodeFrequency] = {}

        for ev in events:
            # Use matched code if available, otherwise use a keyword-based key
            if ev.matched_code:
                key = ev.matched_code
                category = ev.matched_category
                message = ev.matched_message
            else:
                # Group unmatched events by severity + log_type
                key = f"UNMATCHED_{ev.severity}_{ev.log_type}"
                category = ev.log_type or "Unknown"
                message = f"Unmatched {ev.severity} event"

            # Look up severity from error code database if available
            ec = ALL_ERROR_CODES.get(key)
            severity = ec.severity if ec else ev.severity

            if key not in freq_map:
                freq_map[key] = CodeFrequency(
                    code=key,
                    category=category,
                    message=message,
                    count=0,
                    severity=severity,
                    sample_events=[],
                )

            freq_map[key].count += 1
            if len(freq_map[key].sample_events) < self.max_samples:
                freq_map[key].sample_events.append(ev)

        return freq_map


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------

def diff_baseline(
    incident_timeline: TimelineResult,
    baseline_timeline: TimelineResult,
    incident_log_files: list[str],
    baseline_log_files: list[str],
    increase_threshold: float = 1.5,
    decrease_threshold: float = 0.5,
) -> BaselineDiffResult:
    """
    Compare incident events against a baseline.

    Parameters
    ----------
    incident_timeline : TimelineResult
    baseline_timeline : TimelineResult
    incident_log_files : list[str]
    baseline_log_files : list[str]
    increase_threshold : float
        Ratio above which a code is "increased" (default: 1.5).
    decrease_threshold : float
        Ratio below which a code is "decreased" (default: 0.5).

    Returns
    -------
    BaselineDiffResult
    """
    differ = BaselineDiffer(
        increase_threshold=increase_threshold,
        decrease_threshold=decrease_threshold,
    )
    return differ.diff(
        incident_timeline=incident_timeline,
        baseline_timeline=baseline_timeline,
        incident_log_files=incident_log_files,
        baseline_log_files=baseline_log_files,
    )
