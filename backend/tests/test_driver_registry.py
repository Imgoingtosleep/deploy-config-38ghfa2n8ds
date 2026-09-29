import unittest
from unittest.mock import patch

from app.core.driver_registry import DriverDefinition, DriverRegistry


class DriverRegistryTest(unittest.TestCase):
    def setUp(self):
        DriverRegistry.reload()

    def test_catalog_contains_expected_drivers(self):
        catalog = DriverRegistry.get_catalog()
        expected = [
            "autodetect",
            "unknown",
            "huawei",
            "cisco_ios",
            "raisecom_roap",
            "cisco_nxos",
            "hp_comware",
            "aruba_os",
            "juniper_junos",
            "mikrotik_routeros",
        ]
        for name in expected:
            self.assertIn(name, catalog, f"Expected {name} to be in DriverRegistry catalog")

    def test_get_supported_device_types(self):
        types = DriverRegistry.get_supported_device_types()
        self.assertTrue(len(types) >= 5)

        values = [t["value"] for t in types]
        self.assertIn("autodetect", values)
        self.assertIn("unknown", values)
        self.assertIn("huawei", values)
        self.assertIn("cisco_ios", values)
        self.assertIn("raisecom_roap", values)

        # Check metadata presence
        hw = next(t for t in types if t["value"] == "huawei")
        self.assertEqual(hw["save_command"], "save")
        self.assertEqual(hw["default_pre_check"], "display interface brief")

        cisco = next(t for t in types if t["value"] == "cisco_ios")
        self.assertEqual(cisco["save_command"], "write memory")
        self.assertEqual(cisco["default_pre_check"], "show ip interface brief")

    def test_alias_normalization(self):
        cases = [
            ("huawei", "huawei"),
            ("vrp", "huawei"),
            ("quidway", "huawei"),
            ("cloudengine", "huawei"),
            ("cisco", "cisco_ios"),
            ("cisco_ios", "cisco_ios"),
            ("ios", "cisco_ios"),
            ("ios-xe", "cisco_ios"),
            ("cisco_nxos", "cisco_nxos"),
            ("nxos", "cisco_nxos"),
            ("raisecom", "raisecom_roap"),
            ("roap", "raisecom_roap"),
            ("aruba", "aruba_os"),
            ("procurve", "aruba_os"),
            ("juniper", "juniper_junos"),
            ("junos", "juniper_junos"),
            ("mikrotik", "mikrotik_routeros"),
            ("routeros", "mikrotik_routeros"),
            ("auto", "autodetect"),
            ("unknown", "unknown"),
        ]
        for raw, expected in cases:
            self.assertEqual(
                DriverRegistry.normalize_driver_alias(raw),
                expected,
                f"Failed mapping alias '{raw}' to '{expected}'",
            )

    def test_telnet_mapping(self):
        self.assertEqual(DriverRegistry.get_telnet_driver("huawei"), "huawei_telnet")
        self.assertEqual(DriverRegistry.get_telnet_driver("cisco_ios"), "cisco_ios_telnet")
        self.assertEqual(DriverRegistry.get_telnet_driver("raisecom_roap"), "raisecom_telnet")
        self.assertEqual(DriverRegistry.get_telnet_driver("hp_comware"), "hp_comware_telnet")
        self.assertEqual(DriverRegistry.get_telnet_driver("aruba_os"), "aruba_procurve_telnet")
        self.assertEqual(DriverRegistry.get_telnet_driver("juniper_junos"), "juniper_junos_telnet")

    def test_save_command_and_kwargs(self):
        # Huawei: 'save' with prompt confirmation 'y'
        self.assertEqual(DriverRegistry.get_save_command("huawei"), "save")
        hw_kwargs = DriverRegistry.get_save_kwargs("huawei")
        self.assertEqual(hw_kwargs.get("cmd"), "save")
        self.assertTrue(hw_kwargs.get("confirm"))
        self.assertEqual(hw_kwargs.get("confirm_response"), "y")

        # Cisco: 'write memory' without prompt confirmation
        self.assertEqual(DriverRegistry.get_save_command("cisco_ios"), "write memory")
        cs_kwargs = DriverRegistry.get_save_kwargs("cisco_ios")
        self.assertEqual(cs_kwargs.get("cmd"), "write memory")
        self.assertFalse(cs_kwargs.get("confirm"))

        # Juniper: 'commit'
        self.assertEqual(DriverRegistry.get_save_command("juniper_junos"), "commit")

    def test_check_save_output(self):
        # Huawei
        self.assertTrue(DriverRegistry.check_save_output("huawei", "Info: Save configuration successfully.")["success"])
        self.assertFalse(DriverRegistry.check_save_output("huawei", "Error: failed to save")["success"])

        # Cisco
        self.assertTrue(DriverRegistry.check_save_output("cisco_ios", "Building configuration... [OK]")["success"])
        self.assertFalse(DriverRegistry.check_save_output("cisco_ios", "Error saving config")["success"])

        # Juniper
        self.assertTrue(DriverRegistry.check_save_output("juniper_junos", "commit complete")["success"])

    def test_extensibility_dynamic_driver(self):
        """Verify that adding a new driver definition makes it immediately available"""
        mock_custom_driver = DriverDefinition(
            id="fortinet_ssh",
            name="fortinet_ssh",
            label="Fortinet FortiOS",
            netmiko_ssh="fortinet",
            netmiko_telnet=None,
            family="fortinet",
            is_driver=True,
            is_supported_option=True,
            ui_order=95,
            save_command="execute backup config",
            save_confirm=False,
            default_pre_check="get system status",
            default_post_check="get system status",
            version_cmd="get system status",
            detect_banner_regex=r"Fortinet|FortiOS",
            detect_version_regex=r"FortiOS",
            aliases=["fortinet", "fortios", "fortigate"],
        )

        catalog = DriverRegistry.get_catalog().copy()
        catalog["fortinet_ssh"] = mock_custom_driver

        with patch.object(DriverRegistry, "get_catalog", return_value=catalog):
            DriverRegistry.reload()
            # 1. Shows up in supported types
            supported = DriverRegistry.get_supported_device_types()
            self.assertTrue(any(t["value"] == "fortinet_ssh" for t in supported))

            # 2. Aliases map properly
            self.assertEqual(DriverRegistry.normalize_driver_alias("fortigate"), "fortinet_ssh")

            # 3. Save command matches
            self.assertEqual(DriverRegistry.get_save_command("fortinet_ssh"), "execute backup config")

            # 4. Banner signatures include it
            banners = [b[0] for b in DriverRegistry.get_login_banner_signatures()]
            self.assertIn("fortinet_ssh", banners)


if __name__ == "__main__":
    unittest.main()
