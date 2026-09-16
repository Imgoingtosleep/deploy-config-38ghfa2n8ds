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
import threading
import paramiko

# ---------------------------------------------------------------------------
# 1. KEX (Key Exchange) preference order
#    - group14-sha1 : most common on Huawei VRP V200R005+, Cisco IOS 15.x
#    - group1-sha1  : fallback for very old VRP / IOS 12.x
#    - group-exchange-sha256 : modern servers that support DH-GEX
# ---------------------------------------------------------------------------
paramiko.Transport._preferred_kex = (
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group1-sha1",
    "diffie-hellman-group-exchange-sha256",
)

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
