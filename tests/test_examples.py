"""Public demo artifact checks."""
from __future__ import annotations

import json
from pathlib import Path


PUBLIC_DEMO_OIDS = {
    "ZTF17aabblzo",
    "ZTF18aaxddtg",
    "ZTF18abbdazk",
    "ZTF18abdtfcl",
    "ZTF18abduuff",
    "ZTF18abujsbq",
}
PUBLIC_DEMO_RESIDUAL_OIDS = {
    "ZTF18aaxddtg",
    "ZTF18abbdazk",
    "ZTF18abujsbq",
}


def _assert_no_raw_data_files(root: Path) -> None:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        assert path.suffix.lower() not in {".parquet", ".npy", ".npz"}
        assert "tensor" not in path.name.lower()
        assert "raw" not in path.name.lower()


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
    _assert_no_raw_data_files(root)


def test_public_demo_queue_contains_multiple_oid_bundles():
    for base in (Path("examples"), Path("docs") / "examples"):
        discovered = {path.name for path in base.iterdir() if path.is_dir()}
        assert PUBLIC_DEMO_OIDS.issubset(discovered)

        for oid in PUBLIC_DEMO_OIDS:
            root = base / oid
            expected = {
                f"{oid}.casefile.html",
                f"{oid}.casefile.md",
                f"{oid}.casefile.json",
                f"{oid}.lightcurve.png",
            }
            if oid in PUBLIC_DEMO_RESIDUAL_OIDS:
                expected.add(f"{oid}.residuals.png")

            assert root.exists()
            assert expected.issubset({path.name for path in root.iterdir()})
            _assert_no_raw_data_files(root)


def test_public_example_index_links_case_bundle():
    index_json = Path("examples") / "index.json"
    index_html = Path("examples") / "index.html"

    assert index_json.exists()
    assert index_html.exists()
    index = json.loads(index_json.read_text(encoding="utf-8"))
    indexed_oids = {entry["oid"] for entry in index["entries"]}
    assert index["case_count"] >= len(PUBLIC_DEMO_OIDS)
    assert PUBLIC_DEMO_OIDS.issubset(indexed_oids)

    text = index_html.read_text(encoding="utf-8")
    assert "6 case files available." in text
    for oid in PUBLIC_DEMO_OIDS:
        assert f"{oid}/{oid}.casefile.html" in text
        assert f"{oid}/{oid}.casefile.json" in text
    for oid in PUBLIC_DEMO_RESIDUAL_OIDS:
        assert f"{oid}/{oid}.residuals.png" in text


def test_public_demo_pages_and_integrity_files_exist():
    assert (Path("examples") / "index.html").exists()
    assert (Path("docs") / "index.html").exists()
    assert (Path("docs") / "examples" / "index.html").exists()

    example_dirs = [
        path for path in (Path("examples")).iterdir() if path.is_dir()
    ]
    assert any(
        {
            f"{path.name}.casefile.json",
            f"{path.name}.casefile.md",
            f"{path.name}.casefile.html",
            f"{path.name}.lightcurve.png",
        }.issubset({child.name for child in path.iterdir()})
        for path in example_dirs
    )

    _assert_no_raw_data_files(Path("examples"))
    _assert_no_raw_data_files(Path("docs") / "examples")


def test_public_example_bundle_avoids_forbidden_physical_claims():
    text = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for root in (Path("examples"), Path("docs") / "examples")
        for path in root.rglob("*")
        if path.suffix.lower() in {".md", ".html", ".json"}
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
