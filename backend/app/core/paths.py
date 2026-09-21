"""
Where the app keeps its JSON data (credential / command profiles, model rules,
playbooks, templates) and its logs.

- Source / Docker: backend/app/data, as before.
- Windows .exe (PyInstaller): the bundle is unpacked to a temp folder that is
  deleted on exit, so data lives in %APPDATA%\\NetAuto instead and the bundled
  defaults are copied there the first time the app starts.
- NETAUTO_DATA_DIR overrides both.
"""
import os
import sys
import shutil

APP_NAME = "NetAuto"

# Shipped with the .exe as starting data. Credential profiles are deliberately
# not in this list: an .exe handed to someone else must not carry logins.
DEFAULT_DATA_FILES = [
    "command_profiles.json",
    "model_rules.json",
    "playbooks.json",
    "templates.json",
]

IS_FROZEN = bool(getattr(sys, "frozen", False))

# Folder of the app package: the source tree, or the unpacked bundle for the .exe
_BUNDLE_ROOT = getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
BUNDLED_DATA_DIR = os.path.join(_BUNDLE_ROOT, "app", "data")


def _default_data_dir() -> str:
    if IS_FROZEN:
        base = os.getenv("APPDATA") or os.path.join(os.path.expanduser("~"), ".config")
        return os.path.join(base, APP_NAME)
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


DATA_DIR = os.path.abspath(os.getenv("NETAUTO_DATA_DIR") or _default_data_dir())


def data_file(name: str) -> str:
    """Absolute path of one JSON data file"""
    return os.path.join(DATA_DIR, name)


def seed_defaults() -> None:
    """Copy the bundled starting data into DATA_DIR, never overwriting a user's file"""
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.abspath(BUNDLED_DATA_DIR) == DATA_DIR:
        return
    for name in DEFAULT_DATA_FILES:
        src = os.path.join(BUNDLED_DATA_DIR, name)
        dst = data_file(name)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copyfile(src, dst)
