"""Committed fixture sample workflow tests."""
from __future__ import annotations

import json
from pathlib import Path

from scripts import build_sample_casefile as sample_mod


def test_sample_casefile_workflow_builds_demo_artifacts_without_network(tmp_path, capsys):
    casefile_dir = tmp_path / "casefiles"
    workspace_dir = tmp_path / "workspace"

    status = sample_mod.main([
        "--casefile-dir", str(casefile_dir),
        "--workspace-dir", str(workspace_dir),
    ])

    assert status == 0
    summary = json.loads(capsys.readouterr().out)
    json_path = Path(summary["json"])
    assert summary["source"] == "committed fixtures"
    assert summary["network"] == "not_used"
    assert json_path.exists()
    assert Path(summary["markdown"]).exists()
    assert Path(summary["html"]).exists()
    assert summary["figures"]
    assert (workspace_dir / "lightcurves" / f"{sample_mod.DEFAULT_SAMPLE_DATE}.parquet").exists()

    case_data = json.loads(json_path.read_text(encoding="utf-8"))
    assert case_data["oid"] == sample_mod.DEFAULT_SAMPLE_OID
    assert case_data["cross_survey_context"]["status"] == "not_requested"
    assert case_data["anomaly_assessment"]["status"]
    assert case_data["light_curve_points"]


def test_sample_workflow_module_has_no_network_imports():
    source = Path(sample_mod.__file__).read_text(encoding="utf-8")
    for forbidden in (
        "import requests",
        "from requests",
        "urllib.request",
        "import urllib",
        "import httpx",
        "from httpx",
        "from alerce",
        "import alerce",
    ):
        assert forbidden not in source
