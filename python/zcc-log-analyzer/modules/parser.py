"""
parser.py
=========
Multi-pattern log line parser for Zscaler Client Connector log files.

Handles multiple ZCC log timestamp formats across platforms:
  - Windows:  2024-01-15 10:23:45.123 [ERROR] ...
  - macOS:    Jan 15 10:23:45 ZscalerApp[1234]: ...
  - ISO 8601: 2024-01-15T10:23:45.123Z ...
  - Epoch:    1705312345.123 ...
  - ZCC App:  [2024-01-15 10:23:45.123] [ERROR] [Module] message
  - ZCC Svc:  2024/01/15 10:23:45 ERROR message
  - ZCC Tun:  10:23:45.123 ERROR message  (date inferred from file)
"""

import re
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from .error_codes import (
    KEYWORD_PATTERNS,
    ALL_ERROR_CODES,
    Severity,
    get_severity_rank,
    lookup_by_alias,
)
from .extractor import LogFile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Parsed log event
# ---------------------------------------------------------------------------
@dataclass
class LogEvent:
    """A single parsed log event."""
    timestamp: Optional[datetime]       # Parsed timestamp (UTC-aware if possible)
    timestamp_raw: str                  # Original timestamp string from log
    severity: str                       # Severity level
    source_file: str                    # Log file name (e.g. "ZscalerApp.log")
    log_type: str                       # Log type (e.g. "ZscalerApp")
    message: str                        # Full log line / message
    matched_code: str = ""              # Matched error code (if any)
    matched_category: str = ""          # Category of matched error
    matched_message: str = ""           # Short description of matched error
    line_number: int = 0                # Line number in source file
    raw_line: str = ""                  # Original raw line

    @property
    def severity_rank(self) -> int:
        return get_severity_rank(self.severity)

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "timestamp_raw": self.timestamp_raw,
            "severity": self.severity,
            "source_file": self.source_file,
            "log_type": self.log_type,
            "message": self.message,
            "matched_code": self.matched_code,
            "matched_category": self.matched_category,
            "matched_message": self.matched_message,
            "line_number": self.line_number,
        }


# ---------------------------------------------------------------------------
# Timestamp parsers
# ---------------------------------------------------------------------------

# Month abbreviation map for syslog-style timestamps
_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "may": 5, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Ordered list of (regex, parse_function) pairs
# Each parse_function takes a re.Match and returns a datetime (or None)
_TIMESTAMP_FORMATS: list[tuple] = []


def _register(pattern: str):
    """Decorator to register a timestamp parser."""
    def decorator(fn):
        _TIMESTAMP_FORMATS.append((re.compile(pattern), fn))
        return fn
    return decorator


@_register(
    r'^\[?(\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]?'
)
def _parse_iso(m: re.Match) -> Optional[datetime]:
    """ISO 8601 / common datetime: 2024-01-15T10:23:45.123Z or 2024-01-15 10:23:45.123"""
    s = m.group(1).replace('/', '-').replace(' ', 'T')
    # Normalize timezone
    if s.endswith('Z'):
        s = s[:-1] + '+00:00'
    for fmt in [
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ]:
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


@_register(
    r'^(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)'
)
def _parse_syslog(m: re.Match) -> Optional[datetime]:
    """Syslog style: Jan 15 10:23:45"""
    month_str = m.group(1).lower()
    month = _MONTH_MAP.get(month_str)
    if not month:
        return None
    day = int(m.group(2))
    time_str = m.group(3)
    year = datetime.now().year
    try:
        time_parts = time_str.split('.')
        dt = datetime.strptime(f"{year}-{month:02d}-{day:02d} {time_parts[0]}", "%Y-%m-%d %H:%M:%S")
        if len(time_parts) > 1:
            microseconds = int(time_parts[1].ljust(6, '0')[:6])
            dt = dt.replace(microsecond=microseconds)
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


@_register(
    r'^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s'
)
def _parse_time_only(m: re.Match) -> Optional[datetime]:
    """Time-only: 10:23:45.123 (date unknown, use epoch date as placeholder)"""
    time_str = m.group(1)
    try:
        time_parts = time_str.split('.')
        dt = datetime.strptime(time_parts[0], "%H:%M:%S")
        if len(time_parts) > 1:
            microseconds = int(time_parts[1].ljust(6, '0')[:6])
            dt = dt.replace(microsecond=microseconds)
        # Use a sentinel date so time-only events sort correctly relative to each other
        return dt.replace(year=1970, month=1, day=1, tzinfo=timezone.utc)
    except ValueError:
        return None


@_register(
    r'^(\d{10,13}(?:\.\d+)?)\s'
)
def _parse_epoch(m: re.Match) -> Optional[datetime]:
    """Unix epoch timestamp: 1705312345 or 1705312345.123"""
    try:
        ts = float(m.group(1))
        # Handle millisecond epochs
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    except (ValueError, OSError, OverflowError):
        return None


# ---------------------------------------------------------------------------
# Severity detection
# ---------------------------------------------------------------------------
_SEVERITY_PATTERNS = [
    (re.compile(r'\b(CRITICAL|FATAL)\b', re.IGNORECASE), Severity.CRITICAL),
    (re.compile(r'\bERROR\b',            re.IGNORECASE), Severity.ERROR),
    (re.compile(r'\b(WARN|WARNING)\b',   re.IGNORECASE), Severity.WARNING),
    (re.compile(r'\bINFO\b',             re.IGNORECASE), Severity.INFO),
    (re.compile(r'\bDEBUG\b',            re.IGNORECASE), Severity.DEBUG),
    # ZCC bracket format: [ERROR], [WARN], etc.
    (re.compile(r'\[(CRITICAL|FATAL)\]', re.IGNORECASE), Severity.CRITICAL),
    (re.compile(r'\[ERROR\]',            re.IGNORECASE), Severity.ERROR),
    (re.compile(r'\[(WARN|WARNING)\]',   re.IGNORECASE), Severity.WARNING),
    (re.compile(r'\[INFO\]',             re.IGNORECASE), Severity.INFO),
    (re.compile(r'\[DEBUG\]',            re.IGNORECASE), Severity.DEBUG),
]

# Lines that contain these keywords are always treated as errors/warnings
# even if no explicit severity label is present
_IMPLICIT_ERROR_PATTERNS = [
    (re.compile(r'\b(exception|traceback|stack trace)\b', re.IGNORECASE), Severity.CRITICAL),
    (re.compile(r'\b(failed|failure|error|fault)\b',      re.IGNORECASE), Severity.ERROR),
    (re.compile(r'\b(warn|warning|caution)\b',            re.IGNORECASE), Severity.WARNING),
    (re.compile(r'\b(timeout|timed out|unreachable|disconnected|dropped)\b', re.IGNORECASE), Severity.ERROR),
]


def _detect_severity(line: str) -> str:
    """Detect severity level from a log line."""
    for pattern, severity in _SEVERITY_PATTERNS:
        if pattern.search(line):
            return severity
    return Severity.INFO


# ---------------------------------------------------------------------------
# Compiled keyword patterns from error_codes module
# ---------------------------------------------------------------------------
_COMPILED_KEYWORD_PATTERNS = [
    (
        re.compile(kp["pattern"], re.IGNORECASE),
        kp["code"],
        kp["category"],
        kp["message"],
        kp["severity"],
    )
    for kp in KEYWORD_PATTERNS
]

# Compile numeric error code pattern: matches things like "error code: -6" or "code=-7"
_NUMERIC_CODE_RE = re.compile(
    r'(?:error\s*code|auth\s*code|code)\s*[=:]\s*(-?\d+)',
    re.IGNORECASE
)

# ZCC-specific status patterns
_STATUS_PATTERNS = [
    (re.compile(r'\bDisconnected\b',          re.IGNORECASE), "CONN_DISCONNECTED"),
    (re.compile(r'\bPartial\s+Tunnel\b',      re.IGNORECASE), "CONN_PARTIAL"),
    (re.compile(r'\bFallback\s+Mode\b',       re.IGNORECASE), "CONN_FALLBACK"),
    (re.compile(r'\bCaptive\s+Portal\b',      re.IGNORECASE), "CONN_CAPTIVE_PORTAL"),
    (re.compile(r'\bTrusted\s+Network\b',     re.IGNORECASE), "CONN_TRUSTED_NETWORK"),
    (re.compile(r'\bTunnel\s+Down\b',         re.IGNORECASE), "CLOUD_300"),
    (re.compile(r'\bTunnel\s+Disconnected\b', re.IGNORECASE), "CLOUD_301"),
    (re.compile(r'\bGateway\s+Unreachable\b', re.IGNORECASE), "CLOUD_100"),
]


# ---------------------------------------------------------------------------
# Line filter: which lines are worth keeping?
# ---------------------------------------------------------------------------
def _is_relevant_line(line: str, min_severity: str = Severity.WARNING) -> bool:
    """
    Return True if a log line is relevant (meets minimum severity threshold).
    Always includes lines with explicit severity labels at or above threshold.
    """
    min_rank = get_severity_rank(min_severity)
    detected = _detect_severity(line)
    if get_severity_rank(detected) >= min_rank:
        return True

    # Check implicit error patterns
    for pattern, severity in _IMPLICIT_ERROR_PATTERNS:
        if pattern.search(line):
            if get_severity_rank(severity) >= min_rank:
                return True

    return False


# ---------------------------------------------------------------------------
# Core parser
# ---------------------------------------------------------------------------
class LogParser:
    """
    Parses ZCC log files and extracts relevant events.

    Parameters
    ----------
    min_severity : str
        Minimum severity level to include (default: WARNING).
        Use Severity.DEBUG to capture everything.
    include_info : bool
        If True, also include INFO-level events (overrides min_severity for INFO).
    """

    def __init__(
        self,
        min_severity: str = Severity.WARNING,
        include_info: bool = False,
    ):
        self.min_severity = min_severity
        self.include_info = include_info
        self._min_rank = get_severity_rank(min_severity)

    def parse_file(self, log_file: LogFile) -> list[LogEvent]:
        """
        Parse a single LogFile and return a list of LogEvents.

        Parameters
        ----------
        log_file : LogFile
            The log file to parse.

        Returns
        -------
        list[LogEvent]
        """
        events: list[LogEvent] = []
        lines = log_file.lines()

        # Track last known timestamp for time-only lines
        last_known_date: Optional[datetime] = None

        for line_num, raw_line in enumerate(lines, start=1):
            line = raw_line.strip()
            if not line:
                continue

            # Parse timestamp
            timestamp, timestamp_raw = self._parse_timestamp(line)

            # Update last known date for time-only timestamps
            if timestamp and timestamp.year != 1970:
                last_known_date = timestamp
            elif timestamp and timestamp.year == 1970 and last_known_date:
                # Combine known date with time-only timestamp
                timestamp = timestamp.replace(
                    year=last_known_date.year,
                    month=last_known_date.month,
                    day=last_known_date.day,
                )

            # Detect severity
            severity = _detect_severity(line)
            severity_rank = get_severity_rank(severity)

            # Apply minimum severity filter
            if severity_rank < self._min_rank:
                # Still check for implicit error patterns
                is_implicit = False
                for pattern, imp_severity in _IMPLICIT_ERROR_PATTERNS:
                    if pattern.search(line):
                        if get_severity_rank(imp_severity) >= self._min_rank:
                            severity = imp_severity
                            is_implicit = True
                            break
                if not is_implicit:
                    continue

            # Match against error codes
            matched_code, matched_category, matched_message = self._match_error(line)

            event = LogEvent(
                timestamp=timestamp,
                timestamp_raw=timestamp_raw,
                severity=severity,
                source_file=log_file.name,
                log_type=log_file.log_type,
                message=self._clean_message(line),
                matched_code=matched_code,
                matched_category=matched_category,
                matched_message=matched_message,
                line_number=line_num,
                raw_line=raw_line,
            )
            events.append(event)

        logger.debug(
            f"Parsed {len(events)} events from {log_file.name} "
            f"({len(lines)} lines total)"
        )
        return events

    def parse_files(self, log_files: list[LogFile]) -> list[LogEvent]:
        """
        Parse multiple log files and return all events.

        Parameters
        ----------
        log_files : list[LogFile]

        Returns
        -------
        list[LogEvent]  (unsorted — use timeline.py to sort)
        """
        all_events: list[LogEvent] = []
        for lf in log_files:
            try:
                events = self.parse_file(lf)
                all_events.extend(events)
            except Exception as e:
                logger.error(f"Failed to parse {lf.name}: {e}")
        return all_events

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------
    def _parse_timestamp(self, line: str) -> tuple[Optional[datetime], str]:
        """
        Try each registered timestamp format against the line.
        Returns (datetime_or_None, raw_timestamp_string).
        """
        for pattern, parse_fn in _TIMESTAMP_FORMATS:
            m = pattern.match(line)
            if m:
                try:
                    dt = parse_fn(m)
                    if dt:
                        return dt, m.group(0).strip()
                except Exception:
                    continue
        return None, ""

    def _match_error(self, line: str) -> tuple[str, str, str]:
        """
        Match a log line against known error codes and keyword patterns.
        Returns (code, category, message) or ("", "", "") if no match.
        """
        # 1. Check for explicit numeric error codes (e.g. "error code: -6")
        m = _NUMERIC_CODE_RE.search(line)
        if m:
            code_str = m.group(1)
            ec = ALL_ERROR_CODES.get(code_str)
            if ec:
                return ec.code, ec.category, ec.message

        # 2. Check connection status patterns
        for pattern, code in _STATUS_PATTERNS:
            if pattern.search(line):
                ec = ALL_ERROR_CODES.get(code)
                if ec:
                    return ec.code, ec.category, ec.message

        # 3. Check alias map (substring matching)
        line_lower = line.lower()
        # Try longer aliases first to avoid false partial matches
        best_match = None
        best_len = 0
        for alias_lower, ec in _build_alias_items():
            if alias_lower in line_lower and len(alias_lower) > best_len:
                best_match = ec
                best_len = len(alias_lower)
        if best_match:
            return best_match.code, best_match.category, best_match.message

        # 4. Keyword pattern matching
        for pattern, code, category, message, severity in _COMPILED_KEYWORD_PATTERNS:
            if pattern.search(line):
                return code, category, message

        return "", "", ""

    def _clean_message(self, line: str) -> str:
        """Strip leading timestamp and severity label from a log line."""
        # Remove leading timestamp
        for pattern, _ in _TIMESTAMP_FORMATS:
            m = pattern.match(line)
            if m:
                line = line[m.end():].strip()
                break

        # Remove leading severity bracket [ERROR], [WARN], etc.
        line = re.sub(r'^\[(CRITICAL|FATAL|ERROR|WARN|WARNING|INFO|DEBUG)\]\s*', '', line, flags=re.IGNORECASE)
        line = re.sub(r'^(CRITICAL|FATAL|ERROR|WARN|WARNING|INFO|DEBUG)\s*[:\-]?\s*', '', line, flags=re.IGNORECASE)

        return line.strip()


# ---------------------------------------------------------------------------
# Alias map cache (built once)
# ---------------------------------------------------------------------------
_alias_items_cache: Optional[list] = None


def _build_alias_items() -> list:
    """Return cached list of (alias_lower, ErrorCode) sorted by alias length desc."""
    global _alias_items_cache
    if _alias_items_cache is None:
        items = []
        for ec in ALL_ERROR_CODES.values():
            for alias in ec.aliases:
                items.append((alias.lower(), ec))
        # Sort by length descending so longer/more specific aliases match first
        items.sort(key=lambda x: len(x[0]), reverse=True)
        _alias_items_cache = items
    return _alias_items_cache


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------
def parse_logs(
    log_files: list[LogFile],
    min_severity: str = Severity.WARNING,
) -> list[LogEvent]:
    """
    Parse a list of LogFile objects and return all matching events.

    Parameters
    ----------
    log_files : list[LogFile]
    min_severity : str
        Minimum severity to include (default: WARNING).

    Returns
    -------
    list[LogEvent]
    """
    parser = LogParser(min_severity=min_severity)
    return parser.parse_files(log_files)
