"""Single source of truth for paths and pull parameters."""
from __future__ import annotations
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
LIGHTCURVES_DIR = DATA_DIR / "lightcurves"

# Quality cuts. We deliberately do NOT filter by ALeRCE classification — those
# labels are the assumption Argus is built to stress-test, so they belong as
# metadata columns, never as a training filter.
MIN_DETECTIONS = 5          # ndet floor at query time
MIN_REAL_BOGUS = 0.55       # per-detection rb threshold at flatten time

# Query window
DEFAULT_DAYS_BACK = 3

# Pagination + safety
PAGE_SIZE = 200
MAX_OBJECTS = 100           # safety cap for dev pulls; --max-objects 0 disables

# --- Phase 2a: preprocessing ---
TENSORS_DIR = DATA_DIR / "tensors"
CASEFILES_DIR = DATA_DIR / "casefiles"

# Tensor schema
WINDOW_DAYS = 200
BIN_DAYS = 1
N_BINS = WINDOW_DAYS // BIN_DAYS        # 200
N_CHANNELS = 6                           # [g_flux, g_err, g_mask, r_flux, r_err, r_mask]
CHANNEL_ORDER = ("g_flux", "g_err", "g_mask", "r_flux", "r_err", "r_mask")

# Photometry
FLUX_ZEROPOINT = 23.9                    # AB mag zeropoint → flux in μJy
UPPER_LIMIT_SIGMA = 5                    # ZTF diffmaglim is a 5σ upper limit
ASINH_SOFTENING = 2.0                    # μJy; ~2× typical ZTF difference-image point-source noise
