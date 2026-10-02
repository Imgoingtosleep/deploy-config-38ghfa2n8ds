"""
Unit tests for Fortinet FortiGate support:
- DriverRegistry registration, aliases, and metadata
- LLDP parsing:
  - FortiOS <= 7.4 'diagnose lldprx neighbor summary'
  - FortiOS >= 7.6 'diagnose lldp rx neighbor summary'
  - FortiSwitch 'get switch lldp neighbors-summary'
  - Detail block parsing & model extraction
- Role classification (firewall, switch, wireless)
- Save config behavior (FortiOS auto-save)
- Command translator mappings
"""
import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.driver_registry import DriverRegistry
from app.services.lldp_service import LldpService
from app.services.command_translator import CommandTranslator
from app.services.command_profile_service import CommandProfileService
from app.services.save_config import save_startup_config


FORTIOS_74_BRIEF = """
Port       Neighbor-Chassis-ID   Neighbor-Port-ID      Neighbor-Port-Desc    Neighbor-Device-Name
port1      00:09:0f:09:12:34     ge-0/0/1              Uplink-To-Core        Core-Switch-01
port2      70:4c:a5:aa:bb:cc     port24                FS148E-Floor2         FS148E4T18000123
"""

FORTIOS_76_BRIEF = """
Port             Neighbor-Chassis-ID   Neighbor-Port-ID      Neighbor-Port-Desc    Neighbor-Device-Name
port1            00:09:0f:09:12:34     ge-0/0/1              Uplink-To-Core        Core-Switch-01
port2            70:4c:a5:aa:bb:cc     port24                FS148E-Floor2         FS148E4T18000123
internal1        10:05:ca:11:22:33     GigabitEthernet0/1                          Cisco-Edge-Rtr
"""

FORTISWITCH_BRIEF = """
Port         Neighbor-Chassis-ID   Neighbor-Port-ID    Neighbor-Device-Name    System-Capabilities
port1        00:0c:29:11:22:33     port1               FG60F-Branch            Router, Firewall
port24       70:4c:a5:99:88:77     port24              FS-Dist-SW              Bridge
"""

FORTIOS_DETAIL = """
Port: port1
Neighbor Chassis-ID: 00:09:0f:09:12:34
Neighbor Port-ID: ge-0/0/1
Neighbor Device-Name: Core-Switch-01
Neighbor Port-Description: Uplink-To-Core
Neighbor System-Description:
  Cisco IOS Software, C3750E Software (C3750E-UNIVERSALK9-M), Version 15.0(2)SE4
Neighbor Management-Address:
  IPv4: 192.168.10.254
Neighbor Enabled-Capabilities: Bridge, Router

Port: port2
Neighbor Chassis-ID: 70:4c:a5:aa:bb:cc
Neighbor Port-ID: port24
Neighbor Device-Name: FS148E4T18000123
Neighbor Port-Description: FS148E-Floor2
Neighbor System-Description:
  Fortinet FortiSwitch-148E, FortiSwitchOS v7.2.4
Neighbor Management-Address:
  IPv4: 192.168.10.20
Neighbor Enabled-Capabilities: Bridge
"""


class FortinetSupportTest(unittest.TestCase):
    def setUp(self):
        DriverRegistry.reload()

    def test_driver_registry_contains_fortinet(self):
        catalog = DriverRegistry.get_catalog()
        self.assertIn("fortinet", catalog)
        meta = catalog["fortinet"]
        self.assertEqual(meta.family, "fortinet")
        self.assertEqual(meta.save_command, "auto-save (FortiOS)")
        self.assertEqual(meta.lldp_parser, "fortinet")
        self.assertEqual(meta.version_cmd, "get system status")
        self.assertEqual(meta.default_pre_check, "get system interface physical")

    def test_alias_normalization(self):
        cases = [
            ("fortinet", "fortinet"),
            ("fortigate", "fortinet"),
            ("fortios", "fortinet"),
            ("fgt", "fortinet"),
            ("FORTINET", "fortinet"),
        ]
        for raw, expected in cases:
            self.assertEqual(DriverRegistry.normalize_driver_alias(raw), expected)

    def test_lldp_brief_fortios_74(self):
        rows = LldpService.parse_lldp_brief(FORTIOS_74_BRIEF, "fortinet")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["local_port"], "port1")
        self.assertEqual(rows[0]["remote_device"], "Core-Switch-01")
        self.assertEqual(rows[0]["remote_port"], "ge-0/0/1")

        self.assertEqual(rows[1]["local_port"], "port2")
        self.assertEqual(rows[1]["remote_device"], "FS148E4T18000123")
        self.assertEqual(rows[1]["remote_port"], "port24")

    def test_lldp_brief_fortios_76(self):
        rows = LldpService.parse_lldp_brief(FORTIOS_76_BRIEF, "fortinet")
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[2]["local_port"], "internal1")
        self.assertEqual(rows[2]["remote_device"], "Cisco-Edge-Rtr")
        self.assertEqual(rows[2]["remote_port"], "GigabitEthernet0/1")

    def test_lldp_brief_fortiswitch_tabular(self):
        rows = LldpService.parse_lldp_brief(FORTISWITCH_BRIEF, "fortinet")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["local_port"], "port1")
        self.assertEqual(rows[0]["remote_device"], "FG60F-Branch")
        self.assertEqual(rows[0]["remote_port"], "port1")

    def test_lldp_detail_parsing(self):
        rows = LldpService.parse_detail(FORTIOS_DETAIL, "fortinet")
        self.assertEqual(len(rows), 2)

        r0 = rows[0]
        self.assertEqual(r0["local_port"], "port1")
        self.assertEqual(r0["remote_device"], "Core-Switch-01")
        self.assertEqual(r0["remote_port"], "ge-0/0/1")
        self.assertEqual(r0["remote_ip"], "192.168.10.254")
        self.assertIn("C3750E", r0["remote_model"])

        r1 = rows[1]
        self.assertEqual(r1["local_port"], "port2")
        self.assertEqual(r1["remote_device"], "FS148E4T18000123")
        self.assertEqual(r1["remote_port"], "port24")
        self.assertEqual(r1["remote_ip"], "192.168.10.20")
        self.assertEqual(r1["remote_model"], "FortiSwitch-148E")

    def test_vendor_and_model_extraction(self):
        desc = "Fortinet FortiGate-60F, FortiOS v7.2.5 build1517"
        self.assertEqual(LldpService.detect_vendor(desc), "fortinet")
        self.assertEqual(LldpService.builtin_model(desc), "FortiGate-60F")
        self.assertEqual(LldpService.builtin_role("FortiGate-60F"), "firewall")

        desc_sw = "Fortinet FortiSwitch-124E, FortiSwitchOS v7.2.1"
        self.assertEqual(LldpService.detect_vendor(desc_sw), "fortinet")
        self.assertEqual(LldpService.builtin_model(desc_sw), "FortiSwitch-124E")
        self.assertEqual(LldpService.builtin_role("FortiSwitch-124E"), "switch")

        desc_ap = "FortiAP-221E, FortiAPOS v7.0.3"
        self.assertEqual(LldpService.detect_vendor(desc_ap), "fortinet")
        self.assertEqual(LldpService.builtin_role("FortiAP-221E"), "wireless")

    def test_save_config_bypasses_netmiko_not_implemented(self):
        # FortiOS automatically persists configuration; save_startup_config should succeed
        mock_conn = MagicMock()
        mock_conn.device_type = "fortinet"
        # If save_config was called, raise NotImplementedError like Netmiko does
        mock_conn.save_config.side_effect = NotImplementedError("FortinetSSH does not implement save_config")

        res = save_startup_config(mock_conn, device_type="fortinet")
        self.assertTrue(res["success"])
        self.assertIn("auto-saves", res["output"].lower())
        mock_conn.save_config.assert_not_called()

    def test_command_translator_cisco_to_fortinet(self):
        # show version -> get system status
        r1 = CommandTranslator.translate_command("show version", source_vendor="cisco", target_vendor="fortinet")
        self.assertEqual(r1, "get system status")

        # show ip interface brief -> get system interface physical
        r2 = CommandTranslator.translate_command("show ip interface brief", source_vendor="cisco", target_vendor="fortinet")
        self.assertEqual(r2, "get system interface physical")

        # ping
        r3 = CommandTranslator.translate_command("ping 10.0.0.1", source_vendor="cisco", target_vendor="fortinet")
        self.assertEqual(r3, "execute ping 10.0.0.1")

        # traceroute
        r4 = CommandTranslator.translate_command("traceroute 10.0.0.1", source_vendor="cisco", target_vendor="fortinet")
        self.assertEqual(r4, "execute traceroute 10.0.0.1")

    def test_command_profile_fortinet_exists(self):
        profiles = CommandProfileService.get_profiles()
        fortinet_prof = next((p for p in profiles if p.get("driver") == "fortinet" or p.get("parser") == "fortinet"), None)
        self.assertIsNotNone(fortinet_prof)
        self.assertEqual(fortinet_prof.get("parser"), "fortinet")
        self.assertEqual(fortinet_prof.get("commands", {}).get("lldp_brief"), "diagnose lldprx neighbor summary")


if __name__ == "__main__":
    unittest.main()
