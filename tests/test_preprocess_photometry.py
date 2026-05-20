"""Pure photometric transforms — offline tests."""
from __future__ import annotations
import math

import numpy as np
import pytest

from argus.preprocess.photometry import (
    asinh_stretch, asinh_stretch_err, diffmaglim_to_noise,
    magerr_to_fluxerr, mag_to_flux,
)


def test_mag_to_flux_at_zeropoint_is_one():
    """mag = zp ⇒ flux = 1 (μJy at zp=23.9)."""
    assert mag_to_flux(23.9) == pytest.approx(1.0)


def test_mag_to_flux_one_mag_brighter_is_pogson_ratio():
    assert mag_to_flux(22.9) == pytest.approx(10 ** 0.4)


def test_mag_to_flux_vectorized():
    arr = mag_to_flux(np.array([23.9, 22.9, 21.9]))
    np.testing.assert_allclose(arr, np.array([1.0, 10**0.4, 10**0.8]))


def test_magerr_to_fluxerr_at_zeropoint():
    # at mag=zp, flux=1, so fluxerr = (ln10/2.5) * magerr
    expected = (math.log(10) / 2.5) * 0.1
    assert magerr_to_fluxerr(23.9, 0.1) == pytest.approx(expected)


def test_diffmaglim_to_noise_is_fifth_of_limit_flux():
    """ZTF diffmaglim is a 5σ upper limit ⇒ 1σ = limit_flux / 5."""
    lim_flux = mag_to_flux(20.0)
    assert diffmaglim_to_noise(20.0) == pytest.approx(lim_flux / 5.0)


def test_asinh_stretch_zero_at_zero():
    assert asinh_stretch(0.0, 2.0) == 0.0


def test_asinh_stretch_linear_at_small_signal():
    """asinh(x) ≈ x for |x|≪1 ⇒ s·asinh(f/s) ≈ f for |f|≪s."""
    assert asinh_stretch(0.01, 2.0) == pytest.approx(0.01, abs=1e-5)


def test_asinh_stretch_compresses_large_signal():
    s = 2.0
    out = asinh_stretch(200.0, s)
    assert out < 200.0
    assert out == pytest.approx(s * math.asinh(100.0), rel=1e-6)


def test_asinh_stretch_symmetric_through_zero():
    """asinh handles negative flux smoothly (difference imaging can give negative)."""
    s = 2.0
    assert asinh_stretch(-5.0, s) == pytest.approx(-asinh_stretch(5.0, s))


def test_asinh_stretch_err_propagation():
    """At |f|=s, derivative = 1/sqrt(2), so propagated err = original/sqrt(2)."""
    s = 2.0
    out = asinh_stretch_err(2.0, 0.1, s)
    assert out == pytest.approx(0.1 / math.sqrt(2.0))


def test_asinh_stretch_err_unchanged_at_zero_flux():
    """At f=0, derivative=1, so propagated err = original err."""
    assert asinh_stretch_err(0.0, 0.3, 2.0) == pytest.approx(0.3)
