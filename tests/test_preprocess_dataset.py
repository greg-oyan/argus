"""End-to-end preprocessing tests against committed fixtures. No network, no live API."""
from __future__ import annotations
import json

import numpy as np
import pandas as pd
import pytest

from argus.ingest.storage import flatten_to_dataframe
from argus.preprocess import dataset as ds_mod


@pytest.fixture
def synthetic_pull(tmp_path, fixture_objects, fixture_lightcurves):
    """Lay out a tmp directory that mirrors data/lightcurves and data/raw."""
    date = "2026-01-01"

    parquet_dir = tmp_path / "lightcurves"
    parquet_dir.mkdir()
    df = flatten_to_dataframe(fixture_objects, fixture_lightcurves)
    df.to_parquet(parquet_dir / f"{date}.parquet", index=False)

    raw_dir = tmp_path / "raw" / date / "lightcurves"
    raw_dir.mkdir(parents=True)
    for oid, lc in fixture_lightcurves.items():
        (raw_dir / f"{oid}.json").write_text(json.dumps(lc))

    return tmp_path, date


@pytest.fixture
def patched_paths(monkeypatch, synthetic_pull):
    tmp_path, date = synthetic_pull
    monkeypatch.setattr(ds_mod, "LIGHTCURVES_DIR", tmp_path / "lightcurves")
    monkeypatch.setattr(ds_mod, "RAW_DIR", tmp_path / "raw")
    return tmp_path, date


def test_build_dataset_shape_and_dtype(patched_paths):
    tmp_path, date = patched_paths
    npz, csv_, summary = ds_mod.build_dataset(date=date, tensors_dir=tmp_path / "tensors")
    arr = np.load(npz, allow_pickle=True)
    X = arr["X"]
    assert X.dtype == np.float32
    assert X.shape[1:] == (200, 6)
    assert X.shape[0] == summary["n_objects"]
    assert np.isfinite(X).all(), "no NaN/inf permitted in output tensor"


def test_build_dataset_channel_order_and_transform_metadata(patched_paths):
    tmp_path, date = patched_paths
    npz, _, _ = ds_mod.build_dataset(date=date, tensors_dir=tmp_path / "tensors")
    arr = np.load(npz, allow_pickle=True)
    assert list(arr["channels"]) == ["g_flux", "g_err", "g_mask", "r_flux", "r_err", "r_mask"]
    # transform parameters must round-trip so consumers can reproduce
    assert float(arr["meta_asinh_softening"]) == 2.0
    assert int(arr["meta_window_days"]) == 200
    assert int(arr["meta_bin_days"]) == 1
    assert float(arr["meta_flux_zeropoint"]) == pytest.approx(23.9)
    assert int(arr["meta_upper_limit_sigma"]) == 5


def test_build_dataset_oids_sorted_and_match_manifest(patched_paths):
    tmp_path, date = patched_paths
    npz, csv_, _ = ds_mod.build_dataset(date=date, tensors_dir=tmp_path / "tensors")
    arr = np.load(npz, allow_pickle=True)
    oids = [str(o) for o in arr["oids"]]
    assert oids == sorted(oids), "objects must be sorted by oid"
    manifest = pd.read_csv(csv_)
    assert list(manifest["oid"]) == oids
    assert (manifest["idx"] == np.arange(len(oids))).all()


def test_manifest_has_required_columns(patched_paths):
    tmp_path, date = patched_paths
    _, csv_, _ = ds_mod.build_dataset(date=date, tensors_dir=tmp_path / "tensors")
    m = pd.read_csv(csv_)
    required = {
        "idx", "oid", "window_end_mjd",
        "n_obs_g", "n_obs_r", "n_uplim_g", "n_uplim_r",
        "total_unmasked_bins", "frac_bins_masked",
        "median_g_asinh", "median_r_asinh",
        "median_g_fallback", "median_r_fallback",
    }
    assert required.issubset(m.columns)


def test_build_dataset_is_deterministic(patched_paths, tmp_path_factory):
    """Same inputs ⇒ byte-identical tensor and oid ordering."""
    _, date = patched_paths
    t1 = tmp_path_factory.mktemp("t1")
    t2 = tmp_path_factory.mktemp("t2")
    ds_mod.build_dataset(date=date, tensors_dir=t1)
    ds_mod.build_dataset(date=date, tensors_dir=t2)
    a = np.load(t1 / f"{date}.npz", allow_pickle=True)
    b = np.load(t2 / f"{date}.npz", allow_pickle=True)
    assert list(a["oids"]) == list(b["oids"])
    np.testing.assert_array_equal(a["X"], b["X"])


def test_mask_zero_bins_are_strictly_zero(patched_paths):
    """The sanity check inside build_dataset also enforces this — verify directly."""
    tmp_path, date = patched_paths
    npz, _, _ = ds_mod.build_dataset(date=date, tensors_dir=tmp_path / "tensors")
    X = np.load(npz, allow_pickle=True)["X"]
    for col in (0, 3):
        masked_off = X[:, :, col + 2] == 0
        assert (X[:, :, col][masked_off] == 0).all()
        assert (X[:, :, col + 1][masked_off] == 0).all()
