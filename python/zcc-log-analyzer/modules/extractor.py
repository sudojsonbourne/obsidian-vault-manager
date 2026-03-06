"""
extractor.py
============
Handles ZIP archive ingestion, nested ZIP extraction, and log file discovery
for Zscaler Client Connector log bundles.

ZCC log bundles typically contain files such as:
  - ZscalerApp.log / ZscalerApp.log.1 ... ZscalerApp.log.N
  - ZscalerTunnel.log
  - ZscalerService.log
  - ZscalerFallback.log
  - ZscalerUpdater.log
  - ZscalerDiagnostics.log
  - ZscalerZPA.log
  - ZscalerZDX.log
  - ZscalerCrash.log
  - ZscalerNetworkExtension.log  (macOS)
  - ZscalerSystemExtension.log   (macOS)
  - ZscalerTunnel2.log
  - ZscalerPAC.log
  - ZscalerProxy.log
  - ZscalerAgent.log
  - ZscalerMDM.log
  - ZscalerDeception.log
  - ZscalerIsolation.log
  - ZscalerBrowser.log
  - ZscalerDLP.log
  - ZscalerCBP.log
  - syslog / system.log / event logs (Windows .evtx exported as .txt)
  - Any *.log file in the archive
"""

import io
import os
import re
import zipfile
import tempfile
import shutil
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Known ZCC log file name patterns (case-insensitive)
# ---------------------------------------------------------------------------
KNOWN_LOG_PATTERNS = [
    r"zscaler.*\.log(\.\d+)?$",
    r"zcc.*\.log(\.\d+)?$",
    r"zapp.*\.log(\.\d+)?$",
    r"ztunnel.*\.log(\.\d+)?$",
    r"zpa.*\.log(\.\d+)?$",
    r"zdx.*\.log(\.\d+)?$",
    r"zservice.*\.log(\.\d+)?$",
    r"zfallback.*\.log(\.\d+)?$",
    r"zupdater.*\.log(\.\d+)?$",
    r"zdiag.*\.log(\.\d+)?$",
    r"zcrash.*\.log(\.\d+)?$",
    r"zproxy.*\.log(\.\d+)?$",
    r"zagent.*\.log(\.\d+)?$",
    r"zmdm.*\.log(\.\d+)?$",
    r"zdlp.*\.log(\.\d+)?$",
    r"zcbp.*\.log(\.\d+)?$",
    r"zbrowser.*\.log(\.\d+)?$",
    r"zisolation.*\.log(\.\d+)?$",
    r"zdeception.*\.log(\.\d+)?$",
    r".*\.log(\.\d+)?$",   # fallback: any .log file
]

_KNOWN_LOG_RE = [re.compile(p, re.IGNORECASE) for p in KNOWN_LOG_PATTERNS]

# Priority order for log files (higher index = lower priority)
LOG_PRIORITY = [
    "ZscalerApp",
    "ZscalerTunnel",
    "ZscalerService",
    "ZscalerZPA",
    "ZscalerFallback",
    "ZscalerUpdater",
    "ZscalerDiagnostics",
    "ZscalerZDX",
    "ZscalerCrash",
    "ZscalerNetworkExtension",
    "ZscalerSystemExtension",
    "ZscalerTunnel2",
    "ZscalerPAC",
    "ZscalerProxy",
    "ZscalerAgent",
    "ZscalerMDM",
    "ZscalerDLP",
    "ZscalerCBP",
    "ZscalerBrowser",
    "ZscalerIsolation",
    "ZscalerDeception",
]


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass
class LogFile:
    """Represents a single extracted log file."""
    name: str           # Original filename (e.g. "ZscalerApp.log")
    path: str           # Path within the ZIP (e.g. "logs/ZscalerApp.log")
    content: bytes      # Raw file content
    size: int           # File size in bytes
    source_zip: str     # Which ZIP archive this came from
    log_type: str = ""  # Detected log type (e.g. "ZscalerApp")

    def text(self, encoding: str = "utf-8", errors: str = "replace") -> str:
        """Decode content to string."""
        return self.content.decode(encoding, errors=errors)

    def lines(self, encoding: str = "utf-8") -> list[str]:
        """Return content as a list of lines."""
        return self.text(encoding).splitlines()


@dataclass
class ExtractionResult:
    """Result of extracting a ZIP archive."""
    source_path: str
    log_files: list[LogFile] = field(default_factory=list)
    skipped_files: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    nested_zips: list[str] = field(default_factory=list)

    @property
    def total_size(self) -> int:
        return sum(f.size for f in self.log_files)

    @property
    def file_count(self) -> int:
        return len(self.log_files)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _detect_log_type(filename: str) -> str:
    """
    Detect the ZCC log type from a filename.
    Returns a clean type string like 'ZscalerApp', 'ZscalerTunnel', etc.
    """
    base = Path(filename).stem
    # Strip rotation suffixes like .1, .2, .old
    base = re.sub(r'\.\d+$', '', base)
    base = re.sub(r'\.old$', '', base, flags=re.IGNORECASE)

    for known in LOG_PRIORITY:
        if base.lower() == known.lower():
            return known

    # Partial match
    for known in LOG_PRIORITY:
        if known.lower() in base.lower():
            return known

    return base  # Return as-is if no match


def _is_log_file(filename: str) -> bool:
    """Return True if the filename looks like a ZCC log file."""
    name = Path(filename).name
    for pattern in _KNOWN_LOG_RE:
        if pattern.match(name):
            return True
    return False


def _log_priority_key(log_file: LogFile) -> tuple:
    """Sort key: known types first by priority, then alphabetically."""
    try:
        idx = LOG_PRIORITY.index(log_file.log_type)
    except ValueError:
        idx = len(LOG_PRIORITY)

    # For rotated logs (e.g. ZscalerApp.log.1), sort by rotation number
    rotation = 0
    m = re.search(r'\.(\d+)$', log_file.name)
    if m:
        rotation = int(m.group(1))

    return (idx, rotation, log_file.name)


# ---------------------------------------------------------------------------
# Core extractor
# ---------------------------------------------------------------------------
class ZipExtractor:
    """
    Extracts ZCC log files from a ZIP archive (including nested ZIPs).

    Parameters
    ----------
    max_file_size_mb : int
        Maximum individual file size to extract (default 200 MB).
    max_total_size_mb : int
        Maximum total extracted size (default 1 GB).
    max_depth : int
        Maximum nesting depth for nested ZIPs (default 3).
    """

    def __init__(
        self,
        max_file_size_mb: int = 200,
        max_total_size_mb: int = 1024,
        max_depth: int = 3,
    ):
        self.max_file_size = max_file_size_mb * 1024 * 1024
        self.max_total_size = max_total_size_mb * 1024 * 1024
        self.max_depth = max_depth

    def extract(self, zip_path: str) -> ExtractionResult:
        """
        Extract all log files from a ZIP archive.

        Parameters
        ----------
        zip_path : str
            Path to the ZIP file.

        Returns
        -------
        ExtractionResult
        """
        zip_path = str(zip_path)
        result = ExtractionResult(source_path=zip_path)

        if not os.path.exists(zip_path):
            result.errors.append(f"File not found: {zip_path}")
            return result

        if not zipfile.is_zipfile(zip_path):
            result.errors.append(f"Not a valid ZIP file: {zip_path}")
            return result

        logger.info(f"Extracting: {zip_path}")
        self._extract_zip(zip_path, result, depth=0, source_label=zip_path)

        # Sort log files by priority
        result.log_files.sort(key=_log_priority_key)

        logger.info(
            f"Extracted {result.file_count} log files "
            f"({result.total_size / 1024:.1f} KB total) from {zip_path}"
        )
        return result

    def _extract_zip(
        self,
        zip_path: str,
        result: ExtractionResult,
        depth: int,
        source_label: str,
        zip_bytes: bytes = None,
    ) -> None:
        """Recursively extract a ZIP file."""
        if depth > self.max_depth:
            result.skipped_files.append(f"[depth limit] {zip_path}")
            return

        total_so_far = result.total_size

        try:
            if zip_bytes is not None:
                zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
            else:
                zf = zipfile.ZipFile(zip_path, 'r')

            with zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue

                    member_name = info.filename
                    member_basename = Path(member_name).name

                    # Skip macOS metadata
                    if member_basename.startswith('._') or '__MACOSX' in member_name:
                        continue

                    # Check for nested ZIP
                    if member_basename.lower().endswith('.zip'):
                        if depth < self.max_depth:
                            result.nested_zips.append(member_name)
                            try:
                                nested_bytes = zf.read(info)
                                self._extract_zip(
                                    zip_path=member_name,
                                    result=result,
                                    depth=depth + 1,
                                    source_label=f"{source_label}/{member_name}",
                                    zip_bytes=nested_bytes,
                                )
                            except Exception as e:
                                result.errors.append(
                                    f"Failed to extract nested ZIP {member_name}: {e}"
                                )
                        else:
                            result.skipped_files.append(
                                f"[nested zip depth limit] {member_name}"
                            )
                        continue

                    # Only process log files
                    if not _is_log_file(member_basename):
                        result.skipped_files.append(member_name)
                        continue

                    # Size checks
                    if info.file_size > self.max_file_size:
                        result.skipped_files.append(
                            f"[too large: {info.file_size / 1024 / 1024:.1f} MB] {member_name}"
                        )
                        continue

                    if total_so_far + info.file_size > self.max_total_size:
                        result.skipped_files.append(
                            f"[total size limit reached] {member_name}"
                        )
                        continue

                    # Extract
                    try:
                        content = zf.read(info)
                        log_type = _detect_log_type(member_basename)
                        log_file = LogFile(
                            name=member_basename,
                            path=member_name,
                            content=content,
                            size=len(content),
                            source_zip=source_label,
                            log_type=log_type,
                        )
                        result.log_files.append(log_file)
                        total_so_far += len(content)
                        logger.debug(
                            f"  Extracted: {member_name} ({len(content) / 1024:.1f} KB)"
                        )
                    except Exception as e:
                        result.errors.append(
                            f"Failed to read {member_name}: {e}"
                        )

        except zipfile.BadZipFile as e:
            result.errors.append(f"Bad ZIP file {zip_path}: {e}")
        except Exception as e:
            result.errors.append(f"Error processing {zip_path}: {e}")

    def get_summary(self, result: ExtractionResult) -> dict:
        """Return a summary dict of the extraction result."""
        type_counts: dict[str, int] = {}
        for lf in result.log_files:
            type_counts[lf.log_type] = type_counts.get(lf.log_type, 0) + 1

        return {
            "source": result.source_path,
            "log_files": result.file_count,
            "total_size_kb": round(result.total_size / 1024, 1),
            "log_types": type_counts,
            "nested_zips": len(result.nested_zips),
            "skipped": len(result.skipped_files),
            "errors": len(result.errors),
        }


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------
def extract_logs(zip_path: str, **kwargs) -> ExtractionResult:
    """
    Convenience wrapper around ZipExtractor.extract().

    Parameters
    ----------
    zip_path : str
        Path to the ZCC log ZIP archive.
    **kwargs
        Passed to ZipExtractor constructor.

    Returns
    -------
    ExtractionResult
    """
    extractor = ZipExtractor(**kwargs)
    return extractor.extract(zip_path)
