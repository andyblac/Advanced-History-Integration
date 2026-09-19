#!/usr/bin/env python3
"""Build a locally numbered Advanced History development ZIP."""

from __future__ import annotations

import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
INTEGRATION_DIR = ROOT / "custom_components" / "advanced_history"
COUNTER_PATH = ROOT / "dev-build.json"
LEGACY_COUNTER_PATH = ROOT / ".dev-build-number"
METADATA_PATH = INTEGRATION_DIR / "build.json"
DIST_DIR = ROOT / "dist"
DEV_VERSION_PATTERN = re.compile(r"^(?P<version>.+)-dev\.\d+$")


def next_build_number(
    version: str,
    path: Path = COUNTER_PATH,
    legacy_path: Path | None = LEGACY_COUNTER_PATH,
) -> int:
    """Increment the build number, resetting it for a new release version."""
    try:
        source_path = path
        if not source_path.exists() and legacy_path is not None:
            source_path = legacy_path
        raw_value = source_path.read_text(encoding="utf-8").strip()
        value = json.loads(raw_value)
        if isinstance(value, dict):
            current = int(value.get("number", 0))
            current_version = str(value.get("version", ""))
        else:
            # Migrate the original integer-only counter without losing its value.
            current = int(value)
            current_version = version
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        current = 0
        current_version = ""

    number = current + 1 if current_version == version else 1
    path.write_text(
        json.dumps({"version": version, "number": number}, indent=2) + "\n",
        encoding="utf-8",
    )
    return number


def manifest_version(integration_dir: Path = INTEGRATION_DIR) -> str:
    """Read the release version from the integration manifest."""
    manifest = json.loads(
        (integration_dir / "manifest.json").read_text(encoding="utf-8")
    )
    version = str(manifest["version"])
    match = DEV_VERSION_PATTERN.fullmatch(version)
    return match.group("version") if match else version


def development_version(version: str, number: int) -> str:
    """Return the version Home Assistant should display for a development ZIP."""
    return f"{version}-dev.{number}"


def write_development_manifest(
    version: str,
    number: int,
    integration_dir: Path = INTEGRATION_DIR,
) -> None:
    """Stamp the source manifest so folder-based installs show the build number."""
    path = integration_dir / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["version"] = development_version(version, number)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def build_archive(
    number: int,
    version: str | None = None,
    integration_dir: Path = INTEGRATION_DIR,
    metadata_path: Path = METADATA_PATH,
    dist_dir: Path = DIST_DIR,
) -> Path:
    """Write build metadata and create the development integration ZIP."""
    if version is None:
        version = manifest_version(integration_dir)
    write_development_manifest(version, number, integration_dir)
    metadata_path.write_text(
        json.dumps({"channel": "dev", "number": str(number)}, indent=2) + "\n",
        encoding="utf-8",
    )
    dist_dir.mkdir(exist_ok=True)
    archive_path = dist_dir / f"advanced_history-dev-{number}.zip"
    with ZipFile(archive_path, "w", ZIP_DEFLATED) as archive:
        for path in sorted(integration_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.name == ".DS_Store" or path.suffix == ".pyc":
                continue
            if "__pycache__" in path.parts:
                continue
            archive.write(path, path.relative_to(integration_dir))
    return archive_path


def main() -> None:
    """Create the next locally numbered development build."""
    version = manifest_version()
    number = next_build_number(version)
    archive = build_archive(number, version)
    print(f"Built v{development_version(version, number)}")
    print(archive)


if __name__ == "__main__":
    main()
