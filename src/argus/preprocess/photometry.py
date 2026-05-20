"""Pure photometric transforms: mag↔flux, upper-limit noise, asinh stretch + error propagation."""
from __future__ import annotations
import math

import numpy as np

from argus.config import FLUX_ZEROPOINT, UPPER_LIMIT_SIGMA

_LN10_OVER_2_5 = math.log(10) / 2.5


def mag_to_flux(mag, zp: float = FLUX_ZEROPOINT):
    """AB magnitude → flux. With zp=23.9, output is μJy."""
    return 10.0 ** (-0.4 * (mag - zp))


def magerr_to_fluxerr(mag, magerr, zp: float = FLUX_ZEROPOINT):
    """Propagate magnitude error to flux error: df/f = ln(10)/2.5 * dm."""
    return _LN10_OVER_2_5 * mag_to_flux(mag, zp) * magerr


def diffmaglim_to_noise(diffmaglim, zp: float = FLUX_ZEROPOINT, n_sigma: int = UPPER_LIMIT_SIGMA):
    """ZTF diffmaglim is a 5σ upper limit. 1σ noise is therefore mag_to_flux(diffmaglim) / 5."""
    return mag_to_flux(diffmaglim, zp) / n_sigma


def asinh_stretch(flux, softening: float):
    """Smooth log-like compression that stays linear through zero.

    Returns s * arcsinh(flux/s). For |flux| ≪ s behaves like `flux`; for |flux| ≫ s
    behaves like s * ln(2|flux|/s). Smooth and defined for negative flux (which
    happens in difference imaging).
    """
    return np.arcsinh(np.asarray(flux) / softening) * softening


def asinh_stretch_err(flux, flux_err, softening: float):
    """Propagate flux_err through asinh stretch.

    d/dx [s · arcsinh(x/s)] = 1 / sqrt(1 + (x/s)²)
    """
    return np.asarray(flux_err) / np.sqrt(1.0 + (np.asarray(flux) / softening) ** 2)
