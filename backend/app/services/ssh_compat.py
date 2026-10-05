"""
Global SSH Algorithm Compatibility Configuration.

This module patches paramiko's preferred KEX algorithms and public key types
at import time so that EVERY SSH connection in the application (Netmiko,
Nornir, raw paramiko SSHClient, etc.) automatically negotiates algorithms
compatible with older Huawei VRP, Cisco IOS, and other legacy switches that
only support diffie-hellman-group1/14 and RSA-SHA1.

Usage:
    Simply import this module at the top of any service that opens SSH:

        import app.services.ssh_compat  # noqa: F401  (side-effect import)

    Or import the lock / map if you need them:

        from app.services.ssh_compat import file_lock, device_name_map
"""
import logging
import threading
import paramiko

logger = logging.getLogger("uvicorn.error")

# ---------------------------------------------------------------------------
# 1. KEX (Key Exchange) preference order
#    - group14-sha1 : most common on Huawei VRP V200R005+, Cisco IOS 15.x
#    - group1-sha1  : fallback for very old VRP / IOS 12.x
#    - group-exchange-sha256 : modern servers that support DH-GEX
#    - the rest : fallback for newer devices that disable SHA-1 and DH-GEX. The legacy
#      ones stay first, so switches that support them negotiate exactly as before
#
#    The SHA-1 ones only exist in paramiko 3.x (4.0+ removed them), so paramiko is
#    pinned below 4 in requirements.txt. Any name the installed paramiko cannot run
#    is dropped with a loud warning: offering it anyway makes the handshake die with
#    KeyError: 'diffie-hellman-group14-sha1' once a switch agrees to it.
# ---------------------------------------------------------------------------
CONFIGURED_KEX = (
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group1-sha1",
    "diffie-hellman-group-exchange-sha256",
    "diffie-hellman-group14-sha256",
    "diffie-hellman-group16-sha512",
    "ecdh-sha2-nistp256",
    "ecdh-sha2-nistp384",
    "ecdh-sha2-nistp521",
    "curve25519-sha256@libssh.org",
)
# Host key type legacy switches present; checked by tests/test_ssh_compat.py
REQUIRED_HOST_KEY_TYPES = ("ssh-rsa",)

SUPPORTED_KEX = tuple(k for k in CONFIGURED_KEX if k in paramiko.Transport._kex_info)
MISSING_KEX = tuple(k for k in CONFIGURED_KEX if k not in SUPPORTED_KEX)

if MISSING_KEX:
    logger.warning(
        "SSH compat: paramiko %s does not implement %s; switches that only offer these "
        "cannot be reached. Install paramiko<4 (see requirements.txt / requirements.lock).",
        paramiko.__version__, ", ".join(MISSING_KEX),
    )

paramiko.Transport._preferred_kex = SUPPORTED_KEX or paramiko.Transport._preferred_kex

# ---------------------------------------------------------------------------
# 2. Public-key algorithm preference
#    - rsa-sha2-512 / rsa-sha2-256 : preferred by OpenSSH 8.x+ servers
#    - rsa (ssh-rsa / SHA-1)       : fallback for legacy devices
# ---------------------------------------------------------------------------
paramiko.common.pref_public_keys = ["rsa-sha2-512", "rsa-sha2-256", "rsa"]

# ---------------------------------------------------------------------------
# 3. Shared utilities used across services
# ---------------------------------------------------------------------------
file_lock = threading.Lock()
device_name_map: dict = {}


def ssh_compat_status() -> dict:
    """What the running backend can negotiate, for /system/ssh-compat"""
    missing_keys = [k for k in REQUIRED_HOST_KEY_TYPES if k not in paramiko.Transport._key_info]
    return {
        "paramiko_version": paramiko.__version__,
        "configured_kex": list(CONFIGURED_KEX),
        "active_kex": list(paramiko.Transport._preferred_kex),
        "missing_kex": list(MISSING_KEX),
        "missing_host_key_types": missing_keys,
        "ok": not MISSING_KEX and not missing_keys,
    }


def describe_kex_error(error_text: str):
    """Readable reason for SSH handshake failures caused by algorithm support, else None"""
    text = str(error_text or "")
    lower = text.lower()
    hit = next((k for k in CONFIGURED_KEX if k in text), None)
    if hit and hit in MISSING_KEX:
        return (
            f"SSH Key Exchange Unsupported: the device only accepted '{hit}', which paramiko "
            f"{paramiko.__version__} on the backend no longer implements. Rebuild the backend with "
            f"paramiko<4 (requirements.lock) or enable a SHA-256 key exchange on the device."
        )
    if "no acceptable kex" in lower or "incompatible ssh peer" in lower or "no matching key exchange" in lower:
        return (
            f"SSH Key Exchange Mismatch: the device and backend share no key exchange algorithm. "
            f"Backend offers: {', '.join(paramiko.Transport._preferred_kex)}. "
            f"Check 'display ssh server status' / 'show ip ssh' on the device."
        )
    if "no acceptable host key" in lower:
        return "SSH Host Key Mismatch: the device's host key type is not accepted by the backend (e.g. ssh-dss only)."
    return None

