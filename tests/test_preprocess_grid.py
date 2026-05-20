"""Windowing, binning, and per-object tensorization — offline tests."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from argus.preprocess.grid import (
    Event, asinh_and_median_subtract, bin_to_grid, select_window, tensorize_object,
)
from argus.preprocess.photometry import asinh_stretch


def test_select_window_is_right_aligned():
    assert select_window(1000.0, 200) == (800.0, 1000.0)


def test_bin_single_detection_routes_correctly():
    """One g detection at MJD 905 → bin index 105, mask=1, correct flux/err."""
    events = [Event(mjd=905.0, fid=1, flux=10.0, flux_err=1.0, is_upper_limit=False)]
    arr = bin_to_grid(events, 800.0, 1000.0)
    assert arr.shape == (200, 6)
    assert arr[105, 0] == pytest.approx(10.0)
    assert arr[105, 1] == pytest.approx(1.0)
    assert arr[105, 2] == 1.0
    # neighbors untouched
    assert arr[104, 0] == 0 and arr[106, 0] == 0
    assert arr[104, 2] == 0 and arr[106, 2] == 0


def test_empty_events_yield_all_zero_grid():
    arr = bin_to_grid([], 800.0, 1000.0)
    assert arr.shape == (200, 6)
    assert (arr == 0).all()


def test_filter_routing_g_vs_r():
    """fid=1 → channels 0/1/2, fid=2 → channels 3/4/5."""
    events = [
        Event(mjd=900.5, fid=1, flux=5.0, flux_err=0.5, is_upper_limit=False),
        Event(mjd=900.5, fid=2, flux=8.0, flux_err=0.8, is_upper_limit=False),
    ]
    arr = bin_to_grid(events, 800.0, 1000.0)
    assert arr[100, 0] == 5.0 and arr[100, 2] == 1.0
    assert arr[100, 3] == 8.0 and arr[100, 5] == 1.0


def test_two_detections_in_same_bin_use_inverse_variance():
    e1 = Event(mjd=900.5, fid=1, flux=10.0, flux_err=1.0, is_upper_limit=False)
    e2 = Event(mjd=900.6, fid=1, flux=12.0, flux_err=2.0, is_upper_limit=False)
    arr = bin_to_grid([e1, e2], 800.0, 1000.0)
    # weights 1 and 0.25 ⇒ mean = (10 + 3) / 1.25 = 10.4
    assert arr[100, 0] == pytest.approx(10.4)
    # err = 1/sqrt(1.25) ≈ 0.8944
    assert arr[100, 1] == pytest.approx(1.0 / np.sqrt(1.25), abs=1e-5)
    assert arr[100, 2] == 1.0


def test_detection_in_bin_takes_priority_over_upper_limit():
    """Mixed bin: detection + upper limit → bin is a detection bin only."""
    det = Event(mjd=900.5, fid=1, flux=10.0, flux_err=1.0, is_upper_limit=False)
    uplim = Event(mjd=900.7, fid=1, flux=0.0, flux_err=5.0, is_upper_limit=True)
    arr = bin_to_grid([det, uplim], 800.0, 1000.0)
    assert arr[100, 0] == pytest.approx(10.0)
    assert arr[100, 1] == pytest.approx(1.0)
    assert arr[100, 2] == 1.0


def test_upper_limit_only_bin_is_zero_flux_with_combined_noise():
    """Two uplims with σ=3 and σ=4 → combined 1σ = 1/sqrt(1/9 + 1/16) = 2.4."""
    u1 = Event(mjd=900.4, fid=2, flux=0.0, flux_err=3.0, is_upper_limit=True)
    u2 = Event(mjd=900.7, fid=2, flux=0.0, flux_err=4.0, is_upper_limit=True)
    arr = bin_to_grid([u1, u2], 800.0, 1000.0)
    expected = 1.0 / np.sqrt(1 / 9.0 + 1 / 16.0)
    assert arr[100, 3] == 0.0
    assert arr[100, 4] == pytest.approx(expected, abs=1e-5)
    assert arr[100, 5] == 1.0


def test_events_outside_window_are_dropped():
    early = Event(mjd=799.0, fid=1, flux=5.0, flux_err=1.0, is_upper_limit=False)
    late = Event(mjd=1001.0, fid=1, flux=5.0, flux_err=1.0, is_upper_limit=False)
    arr = bin_to_grid([early, late], 800.0, 1000.0)
    assert (arr == 0).all()


def test_event_at_window_end_is_included():
    """A detection exactly at last_mjd must land in the final bin (right-inclusive)."""
    ev = Event(mjd=1000.0, fid=1, flux=7.0, flux_err=0.5, is_upper_limit=False)
    arr = bin_to_grid([ev], 800.0, 1000.0)
    assert arr[-1, 0] == pytest.approx(7.0)
    assert arr[-1, 2] == 1.0


def test_asinh_median_subtract_fallback_when_no_detections():
    """Filter with only upper limits ⇒ median=0 and *_fallback=True."""
    arr = np.zeros((200, 6), dtype=np.float32)
    arr[50, 1] = 3.0; arr[50, 2] = 1.0  # g upper limit
    out, meta = asinh_and_median_subtract(arr, softening=2.0)
    assert meta["median_g_fallback"] is True
    assert meta["median_g_asinh"] == 0.0
    assert meta["median_r_fallback"] is True


def test_asinh_median_subtract_uses_detection_bins_only():
    """Median computed only on bins where mask=1 AND flux>0; upper-limit bins excluded."""
    arr = np.zeros((200, 6), dtype=np.float32)
    # two g detections at flux 10 and 14
    arr[10, 0] = 10.0; arr[10, 1] = 1.0; arr[10, 2] = 1.0
    arr[20, 0] = 14.0; arr[20, 1] = 1.0; arr[20, 2] = 1.0
    # two g upper limits at flux 0 (should NOT pull the median toward zero)
    arr[30, 1] = 5.0; arr[30, 2] = 1.0
    arr[40, 1] = 5.0; arr[40, 2] = 1.0
    _, meta = asinh_and_median_subtract(arr, softening=2.0)
    expected = float(np.median([asinh_stretch(10.0, 2.0), asinh_stretch(14.0, 2.0)]))
    assert meta["median_g_asinh"] == pytest.approx(expected)
    assert meta["median_g_fallback"] is False


def test_asinh_median_subtract_zeros_masked_bins():
    """Bins with mask=0 must have flux=0 and err=0 after transform."""
    arr = np.zeros((200, 6), dtype=np.float32)
    arr[10, 0] = 10.0; arr[10, 1] = 1.0; arr[10, 2] = 1.0
    out, _ = asinh_and_median_subtract(arr, softening=2.0)
    masked_off = out[:, 2] == 0
    assert (out[masked_off, 0] == 0).all()
    assert (out[masked_off, 1] == 0).all()


def test_tensorize_sparse_object_produces_full_tensor():
    """One detection ⇒ still a (200, 6) tensor with mostly mask=0."""
    det = pd.DataFrame([{"mjd": 950.0, "fid": 1, "magpsf": 20.0, "sigmapsf": 0.1}])
    arr, meta = tensorize_object(det, pd.DataFrame(), last_mjd=1000.0)
    assert arr.shape == (200, 6)
    assert meta["n_obs_g"] == 1
    assert meta["n_obs_r"] == 0
    assert meta["total_unmasked_bins"] >= 1
    assert np.isfinite(arr).all()


def test_tensorize_no_nan_or_inf_with_mixed_inputs():
    det = pd.DataFrame([
        {"mjd": 950.0, "fid": 1, "magpsf": 20.0, "sigmapsf": 0.1},
        {"mjd": 960.0, "fid": 2, "magpsf": 19.5, "sigmapsf": 0.08},
    ])
    nondet = pd.DataFrame([
        {"mjd": 900.0, "fid": 1, "diffmaglim": 21.0},
        {"mjd": 920.0, "fid": 2, "diffmaglim": 20.5},
    ])
    arr, _ = tensorize_object(det, nondet, last_mjd=1000.0)
    assert np.isfinite(arr).all()
