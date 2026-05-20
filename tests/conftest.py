"""Shared test fixtures. Loaded from real ALeRCE responses captured under tests/fixtures/."""
from __future__ import annotations
import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def fixture_objects() -> list[dict]:
    return json.loads((FIXTURES / "objects.json").read_text())


@pytest.fixture(scope="session")
def fixture_lightcurves() -> dict[str, dict]:
    lc_dir = FIXTURES / "lightcurves"
    return {p.stem: json.loads(p.read_text()) for p in sorted(lc_dir.glob("*.json"))}
