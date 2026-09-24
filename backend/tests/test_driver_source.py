"""
Where the SSH driver comes from.

- Credential profiles hold credentials only: the driver is the fleet row's, never the profile's.
- LLDP: a device with a driver (fleet row, auto-detected, or named by a neighbor's LLDP
  description) logs in with that driver only and runs its vendor's command profiles.
  'unknown' (or Auto Detect that cannot name the vendor) sweeps the command profiles in order.
  A wrong password or a dead host is not retried with another driver.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.services.profile_service as profile_svc  # noqa: E402
from app.schemas.device import DeviceCredentials  # noqa: E402
from app.services.lldp_service import LldpService  # noqa: E402
from app.services.netmiko_service import NetmikoService  # noqa: E402

HUAWEI = {"id": "c-hw", "name": "Huawei VRP", "parser": "huawei"}
CISCO = {"id": "c-cs", "name": "Cisco IOS", "parser": "cisco"}
PRIORITY = [HUAWEI, CISCO]  # command profile priority 1, 2


class CredentialProfileHasNoDriverTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._file = profile_svc.DATA_FILE
        profile_svc.DATA_FILE = os.path.join(self._tmp.name, "credential_profiles.json")
        # A profiles.json written before this change: it still names a driver
        with open(profile_svc.DATA_FILE, "w", encoding="utf-8") as f:
            json.dump([{
                "id": "prof-old", "name": "old", "device_type": "cisco_ios", "port": 22, "is_default": True,
                "credentials": [{"priority": 1, "username": "admin", "password": "pw"}],
            }], f)

    def tearDown(self):
        profile_svc.DATA_FILE = self._file
        self._tmp.cleanup()

    def test_an_old_profile_driver_is_dropped_on_load(self):
        prof = profile_svc.ProfileService.get_profile_by_id("prof-old")
        self.assertNotIn("device_type", prof)

    def test_credential_candidates_carry_no_driver(self):
        dev = DeviceCredentials(host="10.254.254.254", profile_id="prof-old", device_type="huawei")
        for cand in NetmikoService._resolve_credential_candidates(dev):
            self.assertNotIn("device_type", cand)

    def test_the_fleet_driver_is_used_to_connect(self):
        dialed = []

        class FakeConn:
            def disconnect(self):
                pass

        def fake_connect(**params):
            dialed.append(params["device_type"])
            return FakeConn()

        dev = DeviceCredentials(host="10.254.254.254", profile_id="prof-old", device_type="huawei")
        with patch("app.services.netmiko_service.ConnectHandler", side_effect=fake_connect), \
                patch.object(NetmikoService, "_prepare_session"):
            with NetmikoService.connect_with_fallback(dev):
                pass
        self.assertEqual(dialed, ["huawei"])  # not the profile's cisco_ios


class DriverPlanTest(unittest.TestCase):
    def plan(self, first=None, telnet=False):
        return [(d, [p["id"] for p in profs]) for d, profs in LldpService.driver_plan(PRIORITY, first, telnet)]

    def test_unknown_sweeps_the_command_profile_order(self):
        self.assertEqual(self.plan(), [("huawei", ["c-hw"]), ("cisco_ios", ["c-cs"])])

    def test_a_known_driver_is_the_only_one_with_its_own_profiles(self):
        self.assertEqual(self.plan("cisco_ios"), [("cisco_ios", ["c-cs"])])

    def test_a_driver_variant_matches_its_vendor_profiles(self):
        self.assertEqual(self.plan("cisco_nxos"), [("cisco_nxos", ["c-cs"])])

    def test_a_known_driver_on_telnet_uses_its_telnet_driver(self):
        self.assertEqual(self.plan("cisco_ios", telnet=True), [("cisco_ios_telnet", ["c-cs"])])

    def test_a_fleet_driver_without_a_command_profile_runs_all_profiles(self):
        self.assertEqual(self.plan("juniper_junos")[0], ("juniper_junos", ["c-hw", "c-cs"]))

    def test_telnet_uses_telnet_drivers(self):
        self.assertEqual([d for d, _ in self.plan(telnet=True)], ["huawei_telnet", "cisco_ios_telnet"])


def result(success=True, rejected=False, error=None):
    return {"success": success, "commands_rejected": rejected, "error": error, "ip": "10.254.254.254",
            "log": "", "status": "Success" if success else f"Failed: {error}"}


class SweepTest(unittest.TestCase):
    def sweep(self, outcomes, first=None):
        tried = []

        def fake_collect(device, depth, driver=None, cmd_profiles=None):
            tried.append(driver)
            return outcomes[len(tried) - 1]

        dev = DeviceCredentials(host="10.254.254.254", device_type=first or "autodetect", username="u", password="p")
        with patch("app.services.command_profile_service.CommandProfileService.resolve_ordered",
                   return_value=PRIORITY), \
                patch.object(LldpService, "collect_device", side_effect=fake_collect):
            LldpService.collect_device_sweep(dev, 0, None, first)
        return tried

    def test_fleet_driver_that_works_needs_one_login(self):
        self.assertEqual(self.sweep([result()], first="cisco_ios"), ["cisco_ios"])

    def test_a_known_driver_whose_commands_are_rejected_is_not_swept(self):
        self.assertEqual(self.sweep([result(rejected=True), result()], first="huawei"), ["huawei"])

    def test_unknown_goes_on_until_a_driver_accepts_the_commands(self):
        self.assertEqual(self.sweep([result(rejected=True), result()]), ["huawei", "cisco_ios"])

    def test_a_wrong_password_is_not_retried_with_another_driver(self):
        err = "Authentication failed across all 1 credential sets on 10.254.254.254"
        self.assertEqual(self.sweep([result(False, error=err)]), ["huawei"])

    def test_a_dead_host_is_not_retried_with_another_driver(self):
        err = "TCP connection to device failed. Common causes: timed out"
        self.assertEqual(self.sweep([result(False, error=err)]), ["huawei"])

    def test_a_driver_that_cannot_read_the_prompt_is_retried(self):
        err = "Pattern not detected: 'terminal width 511'"
        self.assertEqual(self.sweep([result(False, error=err), result()]), ["huawei", "cisco_ios"])


class LldpDriverSourceTest(unittest.TestCase):
    def resolve(self, device_type, detected=None):
        dev = DeviceCredentials(host="10.254.254.254", device_type=device_type, username="u", password="p")
        with patch("app.services.autodetect_service.AutoDetectService.detect_device_type",
                   return_value=detected or ("cant_detect", "why")) as det:
            out = LldpService.resolve_lldp_driver(dev)
        return out, det.called

    def test_a_set_driver_is_used_without_detection(self):
        (drv, _, failed), detected = self.resolve("raisecom_roap")
        self.assertEqual((drv, failed, detected), ("raisecom_roap", None, False))

    def test_unknown_is_swept_without_detection(self):
        (drv, _, failed), detected = self.resolve("unknown")
        self.assertEqual((drv, failed, detected), (None, None, False))

    def test_auto_detect_uses_the_detected_driver(self):
        (drv, _, _), detected = self.resolve("autodetect", ("raisecom_roap", "show version"))
        self.assertEqual((drv, detected), ("raisecom_roap", True))

    def test_auto_detect_that_names_no_vendor_is_swept(self):
        (drv, _, failed), _ = self.resolve("autodetect", ("cant_detect", "no vendor"))
        self.assertEqual((drv, failed), (None, None))

    def test_auto_detect_with_a_rejected_password_does_not_log_in_again(self):
        (drv, _, failed), _ = self.resolve("autodetect", ("auth_failed", "Authentication Failed"))
        self.assertIsNone(drv)
        self.assertFalse(failed["success"])

    def test_neighbor_driver_from_its_lldp_description(self):
        self.assertEqual(LldpService.description_driver("Cisco IOS Software, C2960X Software"), "cisco_ios")
        self.assertEqual(LldpService.description_driver("ROS_5.2.1 ISCOM2608G-4GE-AC"), "raisecom_roap")
        self.assertEqual(LldpService.description_driver("Huawei Versatile Routing Platform"), "huawei")
        self.assertIsNone(LldpService.description_driver(""))
        self.assertIsNone(LldpService.description_driver("Linux 5.10 ubuntu"))


if __name__ == "__main__":
    unittest.main()
