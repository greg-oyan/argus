"""Tests for parsing + storage. No network — uses captured fixtures only."""
from __future__ import annotations
import json

import pandas as pd
import pytest

from argus.ingest.storage import (
    flatten_to_dataframe,
    raw_paths,
    write_parquet,
    write_raw_lightcurve,
    write_raw_objects,
)


def test_fixtures_present(fixture_objects, fixture_lightcurves):
    """Phase 1 acceptance: at least 10 real objects committed as fixtures."""
    assert len(fixture_objects) >= 10
    assert len(fixture_lightcurves) >= 10
    obj_ids = {o["oid"] for o in fixture_objects}
    assert obj_ids == set(fixture_lightcurves.keys())


def test_flatten_real_fixtures(fixture_objects, fixture_lightcurves):
    df = flatten_to_dataframe(fixture_objects, fixture_lightcurves)
    assert len(df) > 0
    assert df["oid"].nunique() >= 1
    expected = {"oid", "mjd", "fid", "magpsf", "rb", "ra", "dec",
                "obj_ndet", "obj_firstmjd", "obj_lastmjd",
                "obj_class", "obj_classifier", "obj_probability"}
    assert expected.issubset(df.columns)


def test_flatten_drops_low_rb():
    objs = [{"oid": "ZTFtest1", "ndet": 3, "firstmjd": 60000.0, "lastmjd": 60001.0,
             "meanra": 1.0, "meandec": 2.0, "class": None,
             "classifier": None, "probability": None}]
    lcs = {"ZTFtest1": {"detections": [
        {"mjd": 60000.0, "fid": 1, "magpsf": 19.0, "rb": 0.9, "ra": 1.0, "dec": 2.0},
        {"mjd": 60000.5, "fid": 2, "magpsf": 19.5, "rb": 0.3, "ra": 1.0, "dec": 2.0},
        {"mjd": 60001.0, "fid": 1, "magpsf": 19.1, "rb": 0.55, "ra": 1.0, "dec": 2.0},
    ]}}
    df = flatten_to_dataframe(objs, lcs, min_rb=0.55)
    assert len(df) == 2
    assert (df["rb"] >= 0.55).all()


def test_flatten_keeps_classification_as_metadata_not_filter():
    """The classifier label MUST be carried on every row and MUST NOT cause filtering."""
    objs = [
        {"oid": "A", "ndet": 1, "class": "SN", "classifier": "lc_classifier",
         "probability": 0.9, "firstmjd": 0, "lastmjd": 1, "meanra": 0, "meandec": 0},
        {"oid": "B", "ndet": 1, "class": None, "classifier": None,
         "probability": None, "firstmjd": 0, "lastmjd": 1, "meanra": 0, "meandec": 0},
    ]
    lcs = {
        "A": {"detections": [{"mjd": 0.5, "fid": 1, "magpsf": 18.0, "rb": 0.9}]},
        "B": {"detections": [{"mjd": 0.5, "fid": 1, "magpsf": 18.0, "rb": 0.9}]},
    }
    df = flatten_to_dataframe(objs, lcs)
    assert set(df["oid"]) == {"A", "B"}, "unclassified objects must survive"
    a_row = df[df["oid"] == "A"].iloc[0]
    b_row = df[df["oid"] == "B"].iloc[0]
    assert a_row["obj_class"] == "SN"
    assert pd.isna(b_row["obj_class"])


def test_flatten_handles_missing_lightcurve_sections():
    """An object with no detections array shouldn't crash."""
    objs = [{"oid": "X", "ndet": 0, "firstmjd": 0, "lastmjd": 0,
             "meanra": 0, "meandec": 0, "class": None,
             "classifier": None, "probability": None}]
    df = flatten_to_dataframe(objs, {"X": {"non_detections": []}})
    assert len(df) == 0


def test_raw_paths_partitions_by_date(tmp_path):
    base, lc = raw_paths(date="2026-01-01", root=tmp_path)
    assert base == tmp_path / "2026-01-01"
    assert lc == tmp_path / "2026-01-01" / "lightcurves"


def test_write_raw_roundtrip(tmp_path, fixture_objects, fixture_lightcurves):
    obj_path = write_raw_objects(fixture_objects, date="2026-01-01", root=tmp_path)
    assert obj_path.exists()
    assert json.loads(obj_path.read_text()) == fixture_objects

    oid, lc = next(iter(fixture_lightcurves.items()))
    lc_path = write_raw_lightcurve(oid, lc, date="2026-01-01", root=tmp_path)
    assert lc_path.exists()
    assert json.loads(lc_path.read_text()) == lc


def test_write_parquet_roundtrip(tmp_path, fixture_objects, fixture_lightcurves):
    df = flatten_to_dataframe(fixture_objects, fixture_lightcurves)
    path = write_parquet(df, date="2026-01-01", root=tmp_path)
    assert path.exists() and path.suffix == ".parquet"
    reloaded = pd.read_parquet(path)
    assert len(reloaded) == len(df)
    assert list(reloaded.columns) == list(df.columns)
