"""
Build-time guard for legacy switch SSH support (run by the Dockerfile).

Fails the image build when the installed paramiko can no longer negotiate the key
exchanges in app/services/ssh_compat.py, instead of finding out from a
KeyError: 'diffie-hellman-group14-sha1' on a real switch.

    python -m unittest discover -s tests -v
"""
import logging
import socket
import threading
import unittest

import paramiko
from paramiko.kex_group14 import KexGroup14SHA256
from paramiko.primes import ModulusPack

from app.services import ssh_compat

# A group-exchange server needs moduli (normally /etc/ssh/moduli, absent in slim images):
# serve the 2048-bit RFC 3526 group 14 prime
_moduli = ModulusPack()
_moduli.pack[2048] = [(2, KexGroup14SHA256.P)]
paramiko.Transport._modulus_pack = _moduli


class _AcceptAll(paramiko.ServerInterface):
    def get_allowed_auths(self, username):
        return "password"

    def check_auth_password(self, username, password):
        return paramiko.AUTH_SUCCESSFUL


class _KexRecorder(logging.Handler):
    """paramiko logs the agreed algorithm as 'Kex: <name>' at DEBUG"""

    def __init__(self):
        super().__init__(logging.DEBUG)
        self.agreed = []

    def emit(self, record):
        msg = record.getMessage().strip()
        if msg.startswith("Kex:"):
            self.agreed.append(msg.split(":", 1)[1].strip())


def _agreed_kex(server_kex: tuple) -> str:
    """Handshake against a server offering `server_kex`; return what the client agreed on"""
    logger = logging.getLogger("paramiko.transport")
    recorder = _KexRecorder()
    old_level = logger.level
    logger.addHandler(recorder)
    logger.setLevel(logging.DEBUG)
    try:
        _handshake(server_kex)
    finally:
        logger.removeHandler(recorder)
        logger.setLevel(old_level)
    return recorder.agreed[0] if recorder.agreed else ""


def _handshake(kex) -> bool:
    """Run a real SSH handshake against an in-process server that only offers `kex`"""
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    host_key = paramiko.RSAKey.generate(2048)
    server_error = []

    def serve():
        conn, _ = listener.accept()
        t = paramiko.Transport(conn)
        t.get_security_options().kex = (kex,) if isinstance(kex, str) else tuple(kex)
        t.add_server_key(host_key)
        try:
            t.start_server(server=_AcceptAll())
            t.accept(timeout=10)
        except Exception as e:
            server_error.append(e)

    th = threading.Thread(target=serve, daemon=True)
    th.start()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect("127.0.0.1", port=port, username="u", password="p",
                       look_for_keys=False, allow_agent=False, timeout=10)
        # The server offers nothing but `kex`, so a finished login means it was negotiated
        return client.get_transport().is_authenticated()
    finally:
        client.close()
        listener.close()
        th.join(timeout=5)


class SshCompatTest(unittest.TestCase):
    def test_all_configured_kex_are_implemented(self):
        self.assertEqual(
            ssh_compat.MISSING_KEX, (),
            f"paramiko {paramiko.__version__} lacks {ssh_compat.MISSING_KEX}; keep paramiko<4",
        )

    def test_preferred_kex_is_the_configured_order(self):
        self.assertEqual(tuple(paramiko.Transport._preferred_kex), ssh_compat.CONFIGURED_KEX)

    def test_legacy_host_key_types_supported(self):
        for key_type in ssh_compat.REQUIRED_HOST_KEY_TYPES:
            self.assertIn(key_type, paramiko.Transport._key_info)

    def test_handshake_with_each_configured_kex(self):
        for kex in ssh_compat.CONFIGURED_KEX:
            with self.subTest(kex=kex):
                self.assertTrue(_handshake(kex))

    def test_legacy_kex_still_preferred_when_device_offers_both(self):
        # A switch that supports modern and legacy KEX must keep negotiating group14-sha1
        agreed = _agreed_kex(("curve25519-sha256@libssh.org", "ecdh-sha2-nistp256", "diffie-hellman-group14-sha1"))
        self.assertEqual(agreed, "diffie-hellman-group14-sha1")

    def test_status_reports_ok(self):
        self.assertTrue(ssh_compat.ssh_compat_status()["ok"])


if __name__ == "__main__":
    unittest.main()
