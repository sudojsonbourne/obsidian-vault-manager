"""
timeline.py
===========
Chronological sorting and spike detection for ZCC log events.

Spike detection uses a sliding window approach:
  - Events are bucketed into N-minute windows
  - Windows where the event count exceeds a threshold are flagged as spikes
  - The threshold is configurable (default: 2x the average window rate,
    with a minimum absolute count floor)
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from .parser import LogEvent
from .error_codes import Severity, get_severity_rank

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class TimeWindow:
    """A single time window bucket for spike analysis."""
    start: datetime
    end: datetime
    events: list[LogEvent] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.events)

    @property
    def label(self) -> str:
        return self.start.strftime("%Y-%m-%d %H:%M:%S UTC")

    @property
    def severity_breakdown(self) -> dict[str, int]:
        breakdown: dict[str, int] = {}
        for ev in self.events:
            breakdown[ev.severity] = breakdown.get(ev.severity, 0) + 1
        return breakdown

    @property
    def source_files(self) -> list[str]:
        return sorted(set(ev.source_file for ev in self.events))

    @property
    def top_categories(self) -> list[tuple[str, int]]:
        cats: dict[str, int] = {}
        for ev in self.events:
            cat = ev.matched_category or ev.log_type or "Unknown"
            cats[cat] = cats.get(cat, 0) + 1
        return sorted(cats.items(), key=lambda x: x[1], reverse=True)[:5]

    @property
    def max_severity(self) -> str:
        if not self.events:
            return Severity.INFO
        return max(self.events, key=lambda e: e.severity_rank).severity


@dataclass
class SpikeWindow(TimeWindow):
    """A time window flagged as a spike."""
    is_spike: bool = True
    spike_ratio: float = 0.0        # ratio of this window's count to average
    spike_threshold: int = 0        # threshold that was exceeded


@dataclass
class TimelineResult:
    """Result of timeline analysis."""
    events: list[LogEvent]                  # All events, sorted chronologically
    windows: list[TimeWindow]               # All time windows
    spike_windows: list[SpikeWindow]        # Windows flagged as spikes
    window_minutes: int                     # Window size in minutes
    spike_threshold_multiplier: float       # Multiplier used for spike detection
    spike_min_count: int                    # Minimum absolute count for a spike
    total_events: int = 0
    time_range_start: Optional[datetime] = None
    time_range_end: Optional[datetime] = None

    @property
    def has_spikes(self) -> bool:
        return len(self.spike_windows) > 0

    @property
    def duration_minutes(self) -> Optional[float]:
        if self.time_range_start and self.time_range_end:
            delta = self.time_range_end - self.time_range_start
            return delta.total_seconds() / 60
        return None

    @property
    def events_per_minute(self) -> Optional[float]:
        if self.duration_minutes and self.duration_minutes > 0:
            return self.total_events / self.duration_minutes
        return None

    @property
    def severity_summary(self) -> dict[str, int]:
        summary: dict[str, int] = {}
        for ev in self.events:
            summary[ev.severity] = summary.get(ev.severity, 0) + 1
        return summary

    @property
    def category_summary(self) -> list[tuple[str, int]]:
        cats: dict[str, int] = {}
        for ev in self.events:
            cat = ev.matched_category or "Unmatched"
            cats[cat] = cats.get(cat, 0) + 1
        return sorted(cats.items(), key=lambda x: x[1], reverse=True)

    @property
    def source_file_summary(self) -> list[tuple[str, int]]:
        files: dict[str, int] = {}
        for ev in self.events:
            files[ev.source_file] = files.get(ev.source_file, 0) + 1
        return sorted(files.items(), key=lambda x: x[1], reverse=True)

    @property
    def top_error_codes(self) -> list[tuple[str, int]]:
        codes: dict[str, int] = {}
        for ev in self.events:
            if ev.matched_code:
                codes[ev.matched_code] = codes.get(ev.matched_code, 0) + 1
        return sorted(codes.items(), key=lambda x: x[1], reverse=True)[:20]

    def chart_data(self) -> dict:
        """Return data suitable for Chart.js timeline chart."""
        labels = []
        counts = []
        spike_flags = []
        spike_set = {id(w) for w in self.spike_windows}

        for w in self.windows:
            labels.append(w.label)
            counts.append(w.count)
            spike_flags.append(id(w) in spike_set)

        return {
            "labels": labels,
            "counts": counts,
            "spike_flags": spike_flags,
        }


# ---------------------------------------------------------------------------
# Timeline analyzer
# ---------------------------------------------------------------------------

class TimelineAnalyzer:
    """
    Sorts events chronologically and detects activity spikes.

    Parameters
    ----------
    window_minutes : int
        Size of each time window in minutes (default: 5).
    spike_threshold_multiplier : float
        A window is a spike if its count > average * multiplier (default: 2.0).
    spike_min_count : int
        Minimum absolute event count for a window to be considered a spike
        (prevents false positives when average is very low). Default: 10.
    """

    def __init__(
        self,
        window_minutes: int = 5,
        spike_threshold_multiplier: float = 2.0,
        spike_min_count: int = 10,
    ):
        self.window_minutes = window_minutes
        self.spike_threshold_multiplier = spike_threshold_multiplier
        self.spike_min_count = spike_min_count

    def analyze(self, events: list[LogEvent]) -> TimelineResult:
        """
        Sort events and perform spike detection.

        Parameters
        ----------
        events : list[LogEvent]
            Unsorted list of parsed log events.

        Returns
        -------
        TimelineResult
        """
        if not events:
            return TimelineResult(
                events=[],
                windows=[],
                spike_windows=[],
                window_minutes=self.window_minutes,
                spike_threshold_multiplier=self.spike_threshold_multiplier,
                spike_min_count=self.spike_min_count,
                total_events=0,
            )

        # Separate events with and without timestamps
        timestamped = [e for e in events if e.timestamp is not None]
        no_timestamp = [e for e in events if e.timestamp is None]

        # Sort timestamped events chronologically
        timestamped.sort(key=lambda e: e.timestamp)

        # Append no-timestamp events at the end
        sorted_events = timestamped + no_timestamp

        # Determine time range
        time_start = timestamped[0].timestamp if timestamped else None
        time_end = timestamped[-1].timestamp if timestamped else None

        logger.info(
            f"Timeline: {len(sorted_events)} events, "
            f"{len(timestamped)} with timestamps, "
            f"{len(no_timestamp)} without"
        )

        # Build time windows
        windows = self._build_windows(timestamped, time_start, time_end)

        # Detect spikes
        spike_windows = self._detect_spikes(windows)

        result = TimelineResult(
            events=sorted_events,
            windows=windows,
            spike_windows=spike_windows,
            window_minutes=self.window_minutes,
            spike_threshold_multiplier=self.spike_threshold_multiplier,
            spike_min_count=self.spike_min_count,
            total_events=len(sorted_events),
            time_range_start=time_start,
            time_range_end=time_end,
        )

        if spike_windows:
            logger.warning(
                f"Detected {len(spike_windows)} spike window(s) "
                f"(threshold: {self.spike_min_count} events or "
                f"{self.spike_threshold_multiplier}x average)"
            )
            for sw in spike_windows:
                logger.warning(
                    f"  Spike at {sw.label}: {sw.count} events "
                    f"({sw.spike_ratio:.1f}x average) "
                    f"from: {', '.join(sw.source_files)}"
                )

        return result

    def _build_windows(
        self,
        events: list[LogEvent],
        time_start: Optional[datetime],
        time_end: Optional[datetime],
    ) -> list[TimeWindow]:
        """Bucket events into fixed-size time windows."""
        if not events or not time_start or not time_end:
            return []

        window_delta = timedelta(minutes=self.window_minutes)

        # Align start to the nearest window boundary
        window_start = self._floor_to_window(time_start, window_delta)
        window_end = window_start + window_delta

        windows: list[TimeWindow] = []
        current_window = TimeWindow(start=window_start, end=window_end)
        event_idx = 0

        while event_idx < len(events):
            ev = events[event_idx]
            if ev.timestamp < window_end:
                current_window.events.append(ev)
                event_idx += 1
            else:
                # Save current window (even if empty, to preserve timeline continuity)
                if current_window.count > 0:
                    windows.append(current_window)
                # Advance window
                window_start = window_end
                window_end = window_start + window_delta
                current_window = TimeWindow(start=window_start, end=window_end)

                # Handle large gaps: skip empty windows
                if ev.timestamp >= window_end:
                    window_start = self._floor_to_window(ev.timestamp, window_delta)
                    window_end = window_start + window_delta
                    current_window = TimeWindow(start=window_start, end=window_end)

        # Don't forget the last window
        if current_window.count > 0:
            windows.append(current_window)

        logger.debug(f"Built {len(windows)} time windows of {self.window_minutes} minutes each")
        return windows

    def _detect_spikes(self, windows: list[TimeWindow]) -> list[SpikeWindow]:
        """
        Identify windows with abnormally high event counts.

        A window is a spike if:
          count >= spike_min_count  AND  count >= average_count * multiplier
        """
        if not windows:
            return []

        counts = [w.count for w in windows]
        avg_count = sum(counts) / len(counts) if counts else 0
        threshold = max(
            self.spike_min_count,
            avg_count * self.spike_threshold_multiplier,
        )

        logger.debug(
            f"Spike detection: avg={avg_count:.1f}, "
            f"threshold={threshold:.1f} "
            f"(min={self.spike_min_count}, "
            f"multiplier={self.spike_threshold_multiplier}x)"
        )

        spike_windows: list[SpikeWindow] = []
        for w in windows:
            if w.count >= threshold:
                ratio = w.count / avg_count if avg_count > 0 else float('inf')
                sw = SpikeWindow(
                    start=w.start,
                    end=w.end,
                    events=w.events,
                    is_spike=True,
                    spike_ratio=ratio,
                    spike_threshold=int(threshold),
                )
                spike_windows.append(sw)

        return spike_windows

    @staticmethod
    def _floor_to_window(dt: datetime, window_delta: timedelta) -> datetime:
        """Floor a datetime to the nearest window boundary."""
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        seconds_since_epoch = (dt - epoch).total_seconds()
        window_seconds = window_delta.total_seconds()
        floored_seconds = (seconds_since_epoch // window_seconds) * window_seconds
        return epoch + timedelta(seconds=floored_seconds)


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------

def build_timeline(
    events: list[LogEvent],
    window_minutes: int = 5,
    spike_threshold_multiplier: float = 2.0,
    spike_min_count: int = 10,
) -> TimelineResult:
    """
    Sort events chronologically and detect spikes.

    Parameters
    ----------
    events : list[LogEvent]
        Parsed log events (unsorted).
    window_minutes : int
        Size of each time window in minutes (default: 5).
    spike_threshold_multiplier : float
        Spike threshold as a multiplier of the average (default: 2.0).
    spike_min_count : int
        Minimum absolute count for a spike (default: 10).

    Returns
    -------
    TimelineResult
    """
    analyzer = TimelineAnalyzer(
        window_minutes=window_minutes,
        spike_threshold_multiplier=spike_threshold_multiplier,
        spike_min_count=spike_min_count,
    )
    return analyzer.analyze(events)


def format_duration(minutes: Optional[float]) -> str:
    """Format a duration in minutes to a human-readable string."""
    if minutes is None:
        return "unknown"
    if minutes < 1:
        return f"{int(minutes * 60)}s"
    if minutes < 60:
        return f"{minutes:.1f}m"
    hours = int(minutes // 60)
    mins = int(minutes % 60)
    if hours < 24:
        return f"{hours}h {mins}m"
    days = int(hours // 24)
    hrs = int(hours % 24)
    return f"{days}d {hrs}h {mins}m"
