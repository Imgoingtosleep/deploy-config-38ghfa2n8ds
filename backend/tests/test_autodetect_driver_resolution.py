"""
Auto-detect: turning a detection result into the driver a connection uses.

1. A failed detection (unreachable / auth_failed / cant_detect) is a status, never a driver:
   it used to reach Netmiko as 'unknown' and silently become cisco_ios.
2. Telnet devices have their own detection path and get *_telnet drivers.
3. The cache is keyed by host and port.
4. Serial console devices are never probed over the network.
"""
import os
import socket
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.schemas.device import DeviceCredentials  # noqa: E402
from app.services.autodetect_service import (  # noqa: E402
    _ALL_LOGINS_REJECTED,
    AutoDetectService,
    is_driver,
)
from app.services.netmiko_service import NetmikoService  # noqa: E402
from app.services.nornir_service import NornirService  # noqa: E402

IAC, DO, WILL = 255, 253, 251


def telnet_server(greeting: bytes):
    """One-shot telnet server on localhost: option negotiation, then `greeting`"""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)

    def serve():
        conn, _ = srv.accept()
        with conn:
            conn.sendall(bytes([IAC, DO, 24, IAC, WILL, 1]))  # DO TERMINAL-TYPE, WILL ECHO
            conn.recv(64)  # the client's WONT / DONT answers
            conn.sendall(greeting)
            conn.recv(64)
        srv.close()

    threading.Thread(target=serve, daemon=True).start()
    return srv.getsockname()[1]


class DetectionTestCase(unittest.TestCase):
    def setUp(self):
        AutoDetectService.clear_cache()
        self._default = settings.DEFAULT_DEVICE_TYPE
        settings.DEFAULT_DEVICE_TYPE = "huawei"

    def tearDown(self):
        settings.DEFAULT_DEVICE_TYPE = self._default
        AutoDetectService.clear_cache()


class StatusIsNeverADriverTest(DetectionTestCase):
    def test_statuses_are_not_drivers(self):
        for status in ("unreachable", "auth_failed", "cant_detect", "unknown", "autodetect", ""):
            self.assertFalse(is_driver(status), status)
        self.assertTrue(is_driver("huawei"))

    def test_failed_detection_falls_back_to_the_default_driver(self):
        for status in ("unreachable", "auth_failed", "cant_detect"):
            dev = DeviceCredentials(host="10.254.254.254", device_type="autodetect")
            with patch.object(AutoDetectService, "detect_device_type", return_value=(status, "why")):
                driver, note = AutoDetectService.resolve_driver(dev)
            self.assertEqual(driver, "huawei", status)
            self.assertIn(status, note)

    def test_a_leftover_status_is_detected_again_not_used(self):
        """A fleet row still saying 'unknown' used to become cisco_ios for good"""
        dev = DeviceCredentials(host="10.254.254.254", device_type="unknown", username="u", password="p")
        with patch.object(AutoDetectService, "detect_device_type", return_value=("cant_detect", "why")) as det:
            params = NetmikoService._build_netmiko_dict(dev)
        det.assert_called_once()
        self.assertEqual(params["device_type"], "huawei")
        self.assertEqual(dev.device_type, "huawei")  # the device carries a driver, not the status

    def test_a_set_driver_is_not_detected(self):
        dev = DeviceCredentials(host="10.254.254.254", device_type="cisco_ios")
        with patch.object(AutoDetectService, "detect_device_type") as det:
            self.assertEqual(AutoDetectService.resolve_driver(dev), ("cisco_ios", ""))
        det.assert_not_called()


class TelnetTest(DetectionTestCase):
    def test_banner_is_read_through_option_negotiation(self):
        port = telnet_server(b"\r\nHuawei Versatile Routing Platform Software\r\n\r\nUsername:")
        banner = AutoDetectService._read_telnet_banner("127.0.0.1", port, timeout=3)
        self.assertIn("Huawei Versatile Routing Platform", banner)
        self.assertNotIn("\xff", banner)

    def test_vendor_in_the_telnet_banner_gives_a_telnet_driver(self):
        dev = DeviceCredentials(host="10.254.254.254", port=23, device_type="autodetect")
        with patch.object(AutoDetectService, "_read_telnet_banner",
                          return_value="User Access Verification\r\n\r\nUsername: "):
            detected, reason = AutoDetectService.detect_device_type(dev, force_refresh=True)
        self.assertEqual(detected, "cisco_ios_telnet", reason)

    def test_telnet_probe_uses_telnet_drivers_on_port_23(self):
        dialed = []

        def fake_connect(**kw):
            dialed.append((kw["device_type"], kw["port"]))
            raise Exception("no match")

        dev = DeviceCredentials(host="10.254.254.254", port=23, username="u", password="p")
        with patch("netmiko.ConnectHandler", side_effect=fake_connect):
            AutoDetectService._probe_prioritized_cli(dev, telnet=True)
        self.assertTrue(dialed)
        self.assertTrue(all(d.endswith("_telnet") and p == 23 for d, p in dialed), dialed)

    def test_reachable_telnet_device_is_not_reported_unreachable(self):
        dev = DeviceCredentials(host="10.254.254.254", port=23, device_type="autodetect",
                                username="u", password="p")
        with patch.object(AutoDetectService, "_read_telnet_banner", return_value="\r\nUsername: "), \
                patch.object(AutoDetectService, "_probe_prioritized_cli",
                             return_value=("huawei_telnet", "Detected huawei_telnet via prioritized probe")):
            detected, _ = AutoDetectService.detect_device_type(dev, force_refresh=True)
        self.assertEqual(detected, "huawei_telnet")

    def test_telnet_statuses(self):
        dev = DeviceCredentials(host="10.254.254.254", port=23, device_type="autodetect",
                                username="u", password="p")
        with patch.object(AutoDetectService, "_read_telnet_banner", side_effect=OSError("timed out")):
            self.assertEqual(AutoDetectService.detect_device_type(dev, force_refresh=True)[0], "unreachable")
        with patch.object(AutoDetectService, "_read_telnet_banner", return_value="Username: "), \
                patch.object(AutoDetectService, "_probe_prioritized_cli", return_value=(None, _ALL_LOGINS_REJECTED)):
            self.assertEqual(AutoDetectService.detect_device_type(dev, force_refresh=True)[0], "auth_failed")
        with patch.object(AutoDetectService, "_read_telnet_banner", return_value="Username: "), \
                patch.object(AutoDetectService, "_probe_prioritized_cli", return_value=(None, "inconclusive")):
            self.assertEqual(AutoDetectService.detect_device_type(dev, force_refresh=True)[0], "cant_detect")

    def test_port_23_with_a_vendor_type_connects_over_telnet(self):
        dev = DeviceCredentials(host="10.254.254.254", port=23, device_type="huawei", username="u", password="p")
        self.assertEqual(NetmikoService._build_netmiko_dict(dev)["device_type"], "huawei_telnet")

    def test_nornir_keeps_the_telnet_driver(self):
        from netmiko.ssh_dispatcher import platforms
        # cisco_nxos_telnet only exists in newer Netmiko (the image pins 4.8)
        for drv in ("hp_comware_telnet", "cisco_nxos_telnet", "juniper_junos_telnet", "huawei_telnet"):
            if drv in platforms:
                self.assertEqual(NornirService._map_platform(drv), drv)
        self.assertEqual(NornirService._map_platform("Huawei"), "huawei")  # fuzzy names still map


class CacheTest(DetectionTestCase):
    def test_cache_is_per_port(self):
        AutoDetectService.set_cached_type("10.254.254.254", "huawei", 22)
        self.assertEqual(AutoDetectService.get_cached_type("10.254.254.254", 22), "huawei")
        self.assertIsNone(AutoDetectService.get_cached_type("10.254.254.254", 2222))
        self.assertIsNone(AutoDetectService.get_cached_type("10.254.254.254", 23))

    def test_statuses_are_never_cached(self):
        for status in ("unreachable", "auth_failed", "cant_detect", "unknown"):
            AutoDetectService.set_cached_type("10.254.254.254", status, 22)
            self.assertIsNone(AutoDetectService.get_cached_type("10.254.254.254", 22), status)


class SerialTest(DetectionTestCase):
    def test_serial_device_is_not_probed_over_the_network(self):
        dev = DeviceCredentials(connection_mode="serial", serial_port="/dev/ttyUSB0", device_type="autodetect")
        with patch("socket.socket", side_effect=AssertionError("network probe on a serial device")), \
                patch("socket.create_connection", side_effect=AssertionError("network probe on a serial device")):
            detected, reason = AutoDetectService.detect_device_type(dev, force_refresh=True)
            driver, note = AutoDetectService.resolve_driver(dev)
        self.assertEqual(detected, "cant_detect", reason)
        self.assertEqual(driver, "huawei")
        self.assertIn("serial", note)


if __name__ == "__main__":
    unittest.main()
