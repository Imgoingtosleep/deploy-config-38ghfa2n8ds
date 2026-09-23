"""
Auto-detect regressions seen on a real Huawei S-series switch (192.168.1.2):

1. VRP with a factory password holds the CLI on "Change now? [Y/N]", so there is no prompt
   to match and the probe used to come back empty.
2. When the first credential logs in but the probe is inconclusive, the remaining (wrong)
   credentials were still tried and the device was reported as auth_failed, hiding the fact
   that the login actually worked.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

import paramiko

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.schemas.device import DeviceCredentials  # noqa: E402
from app.services.autodetect_service import AutoDetectService  # noqa: E402

VRP_PASSWORD_PROMPT = (
    "\r\nWarning: The initial password poses security risks.\r\n"
    "The password needs to be changed. Change now? [Y/N]: "
)


def mock_ssh_client(first_read, cmd_responses, remote_version="SSH-2.0--"):
    """paramiko.SSHClient stand-in whose shell replies from `cmd_responses` per sent line"""
    client, channel, transport = MagicMock(), MagicMock(), MagicMock()
    transport.remote_version = remote_version
    client.get_transport.return_value = transport
    client.invoke_shell.return_value = channel

    queue = [first_read]
    sent = []

    def _send(data):
        sent.append(data)
        queue.append(cmd_responses.get(data, "\r\n"))
        return len(data)

    channel.send.side_effect = _send
    channel.recv.side_effect = lambda n: queue.pop(0).encode() if queue else b""
    channel.recv_ready.side_effect = lambda: len(queue) > 0
    return client, sent


class PasswordChangePromptTest(unittest.TestCase):
    def test_huawei_asking_to_change_its_password_is_still_detected(self):
        client, sent = mock_ssh_client(
            VRP_PASSWORD_PROMPT,
            {
                "N\r\n": "\r\n<switch_huawei>",
                "\r\n": "<switch_huawei>",
                "display version\r\n": "Huawei Versatile Routing Platform Software\r\nVRP (R) software\r\n<switch_huawei>",
            },
        )
        with patch("paramiko.SSHClient", return_value=client):
            detected, reason = AutoDetectService._probe_via_ssh(
                host="10.254.254.254", port=22, username="admin", password="pw", timeout=5
            )
        self.assertEqual(detected, "huawei", reason)
        self.assertIn("N\r\n", sent)  # the password change was declined, not accepted

    def test_comware_asking_to_change_its_password_is_not_reported_as_huawei(self):
        client, _ = mock_ssh_client(
            VRP_PASSWORD_PROMPT,
            {
                "N\r\n": "\r\n<HP-Switch>",
                "\r\n": "<HP-Switch>",
                "display version\r\n": "H3C Comware Software, Version 7.1.070\r\n<HP-Switch>",
            },
        )
        with patch("paramiko.SSHClient", return_value=client):
            detected, reason = AutoDetectService._probe_via_ssh(
                host="10.254.254.254", port=22, username="admin", password="pw", timeout=5
            )
        self.assertEqual(detected, "hp_comware", reason)


class CredentialLoopTest(unittest.TestCase):
    CANDIDATES = [
        {"username": "admintest", "password": "good", "device_type": "huawei"},
        {"username": "tester", "password": "bad1", "device_type": "huawei"},
        {"username": "admin", "password": "bad2", "device_type": "huawei"},
    ]

    def setUp(self):
        AutoDetectService.clear_cache()
        self.device = DeviceCredentials(host="10.254.254.254", device_type="autodetect")
        self.patches = [
            patch.object(AutoDetectService, "_probe_raw_ssh_banner", return_value=(None, "")),
            patch("app.services.netmiko_service.NetmikoService._resolve_credential_candidates",
                  return_value=self.CANDIDATES),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        AutoDetectService.clear_cache()

    def _probe_side_effect(self, **kwargs):
        """First credential logs in but tells us nothing; the others are wrong"""
        if kwargs["username"] == "admintest":
            return None, "SSH probe inconclusive"
        raise paramiko.ssh_exception.AuthenticationException("Auth failed")

    def test_a_working_login_is_not_reported_as_auth_failed(self):
        with patch.object(AutoDetectService, "_probe_via_ssh", side_effect=self._probe_side_effect) as probe, \
                patch.object(AutoDetectService, "_probe_prioritized_cli", return_value=(None, "inconclusive")):
            detected, reason = AutoDetectService.detect_device_type(self.device, force_refresh=True)
        self.assertEqual(detected, "unknown", reason)
        self.assertIn("admintest", reason)
        self.assertEqual(probe.call_count, 1)  # the wrong credentials are not tried after a login works

    def test_command_probe_runs_with_the_credential_that_logged_in(self):
        with patch.object(AutoDetectService, "_probe_via_ssh", side_effect=self._probe_side_effect), \
                patch.object(AutoDetectService, "_probe_prioritized_cli",
                             return_value=("huawei", "Detected huawei via prioritized probe")) as cli:
            detected, _ = AutoDetectService.detect_device_type(self.device, force_refresh=True)
        self.assertEqual(detected, "huawei")
        self.assertEqual(cli.call_count, 1)
        self.assertEqual(cli.call_args[0][0].username, "admintest")


if __name__ == "__main__":
    unittest.main()
