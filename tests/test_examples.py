"""Public demo artifact checks."""
from __future__ import annotations

from pathlib import Path


def test_public_example_bundle_contains_expected_artifacts():
    root = Path("examples") / "ZTF18abujsbq"
    expected = {
        "README.md",
        "ZTF18abujsbq.casefile.html",
        "ZTF18abujsbq.casefile.md",
        "ZTF18abujsbq.casefile.json",
        "ZTF18abujsbq.lightcurve.png",
        "ZTF18abujsbq.residuals.png",
    }

    assert root.exists()
    assert expected.issubset({path.name for path in root.iterdir()})
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        assert path.suffix.lower() not in {".parquet", ".npy", ".npz"}
        assert "tensor" not in path.name.lower()
        assert "raw" not in path.name.lower()


def test_public_example_index_links_case_bundle():
    index_json = Path("examples") / "index.json"
    index_html = Path("examples") / "index.html"

    assert index_json.exists()
    assert index_html.exists()
    text = index_html.read_text(encoding="utf-8")
    assert "1 case file available." in text
    assert "ZTF18abujsbq/ZTF18abujsbq.casefile.html" in text
    assert "ZTF18abujsbq/ZTF18abujsbq.residuals.png" in text


def test_public_example_bundle_avoids_forbidden_physical_claims():
    root = Path("examples") / "ZTF18abujsbq"
    text = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in root.iterdir()
        if path.suffix.lower() in {".md", ".html", ".json"}
    )
    text += "\n" + (Path("examples") / "index.html").read_text(
        encoding="utf-8",
        errors="ignore",
    )
    text += "\n" + (Path("examples") / "index.json").read_text(
        encoding="utf-8",
        errors="ignore",
    )
    text = text.lower()
    forbidden = (
        "this is a variable star",
        "this is a supernova",
        "this is an agn",
        "confirmed transient",
        "new physics",
        "anomaly confirmed",
        "classification confirmed",
        "discovery",
    )
    for phrase in forbidden:
        assert phrase not in text, f"public example overclaims: {phrase!r}"
