"""
The 'custom' LLDP output parser: a command profile whose own regexes read the neighbors
(named groups local_port, remote_device, remote_port, remote_ip, remote_model), so a vendor
none of the built-in parsers can read needs no code change. It logs in with the driver
the profile names.
"""
import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.services.command_profile_service as cps  # noqa: E402
from app.schemas.device import DeviceCredentials  # noqa: E402
from app.services.command_profile_service import CommandProfileService  # noqa: E402
from app.services.lldp_service import LldpService  # noqa: E402
from app.services.netmiko_service import NetmikoService  # noqa: E402

# A made-up vendor whose neighbor list none of the built-in parsers reads
BRIEF = """
Port   | Neighbor            | Remote Port | Mgmt Address
-------+---------------------+-------------+--------------
p1     | core-sw.lab.local   | xe-0/0/1    | 10.1.1.1
p2     | edge-02             | ge-0/0/7    | 10.1.1.2
2 neighbors
"""
BRIEF_RX = r"^(?P<local_port>p\d+)\s*\|\s*(?P<remote_device>\S+)\s*\|\s*(?P<remote_port>\S+)\s*\|\s*(?P<remote_ip>\S+)"

DETAIL = """
Neighbor on p1
  System name : core-sw
  Model       : QFX5100-48S
Neighbor on p2
  System name : edge-02
  Model       : EX2300-24T
"""
DETAIL_RX = r"(?s)Neighbor on (?P<local_port>p\d+).*?Model\s*:\s*(?P<remote_model>\S+)"

HUAWEI = {"id": "c-hw", "name": "Huawei VRP", "parser": "huawei"}
CISCO = {"id": "c-cs", "name": "Cisco IOS", "parser": "cisco"}


def custom(driver="huawei", **extra):
    return dict({"id": "c-my", "name": "My vendor", "parser": "custom", "driver": driver}, **extra)


class ParseCustomTest(unittest.TestCase):
    def test_every_match_is_one_neighbor_read_from_its_named_groups(self):
        rows = LldpService.parse_custom(BRIEF, BRIEF_RX)
        self.assertEqual(rows, [
            {"local_port": "p1", "remote_device": "core-sw", "remote_port": "xe-0/0/1",
             "remote_ip": "10.1.1.1", "remote_model": ""},
            {"local_port": "p2", "remote_device": "edge-02", "remote_port": "ge-0/0/7",
             "remote_ip": "10.1.1.2", "remote_model": ""},
        ])

    def test_a_dotall_pattern_reads_multi_line_detail_blocks(self):
        rows = LldpService.parse_custom(DETAIL, DETAIL_RX)
        self.assertEqual([(r["local_port"], r["remote_model"]) for r in rows],
                         [("p1", "QFX5100-48S"), ("p2", "EX2300-24T")])

    def test_a_match_without_a_local_port_takes_the_port_the_command_ran_for(self):
        rows = LldpService.parse_custom("System name : core-sw", r"System name\s*:\s*(?P<remote_device>\S+)",
                                        default_local_port="p1")
        self.assertEqual((rows[0]["local_port"], rows[0]["remote_device"]), ("p1", "core-sw"))

    def test_a_match_with_no_port_at_all_is_dropped(self):
        self.assertEqual(LldpService.parse_custom("System name : core-sw",
                                                  r"System name\s*:\s*(?P<remote_device>\S+)"), [])

    def test_only_an_address_is_kept_as_remote_ip(self):
        rows = LldpService.parse_custom("p1 x mgmt=10.9.9.9/24", r"(?P<local_port>p1) x (?P<remote_ip>\S+)")
        self.assertEqual(rows[0]["remote_ip"], "10.9.9.9")

    def test_empty_or_broken_patterns_read_nothing(self):
        self.assertEqual(LldpService.parse_custom(BRIEF, ""), [])
        self.assertEqual(LldpService.parse_custom(BRIEF, "(?P<local_port>"), [])


class CustomProfileRulesTest(unittest.TestCase):
    def problem(self, **kw):
        prof = {"parser": "custom", "commands": {"lldp_brief": "show neighbors"}, "regexes": {"lldp_brief": BRIEF_RX}}
        for k, v in kw.items():
            prof[k] = dict(prof[k], **v) if isinstance(v, dict) else v
        return CommandProfileService.custom_parser_problem(prof)

    def test_a_complete_custom_profile_is_accepted(self):
        self.assertIsNone(self.problem())
        self.assertIsNone(self.problem(regexes={"lldp_detail": DETAIL_RX}))

    def test_the_neighbor_list_command_and_regex_are_required(self):
        self.assertIn("lldp_brief", self.problem(commands={"lldp_brief": ""}))
        self.assertIn("lldp_brief", self.problem(regexes={"lldp_brief": ""}))

    def test_every_lldp_regex_needs_a_local_port_group(self):
        self.assertIn("local_port", self.problem(regexes={"lldp_brief": r"^(\S+)\s+(\S+)"}))
        self.assertIn("lldp_detail", self.problem(regexes={"lldp_detail": r"Model\s*:\s*(?P<remote_model>\S+)"}))

    def test_a_per_port_detail_regex_need_not_read_the_port(self):
        self.assertIsNone(self.problem(commands={"lldp_detail": "show neighbors {intf}"},
                                       regexes={"lldp_detail": r"Model\s*:\s*(?P<remote_model>\S+)"}))

    def test_a_broken_regex_is_refused(self):
        self.assertIn("Invalid regex", self.problem(regexes={"lldp_brief": "(?P<local_port>"}))

    def test_built_in_parsers_are_not_checked(self):
        self.assertIsNone(CommandProfileService.custom_parser_problem({"parser": "huawei", "commands": {}}))


class CustomProfileStorageTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._data_file = cps.DATA_FILE
        cps.DATA_FILE = os.path.join(self._tmp.name, "command_profiles.json")

    def tearDown(self):
        cps.DATA_FILE = self._data_file
        self._tmp.cleanup()

    def test_a_custom_profile_keeps_its_driver_and_gets_no_built_in_commands(self):
        prof = CommandProfileService.create_profile({
            "name": "My vendor", "parser": "custom", "driver": "Juniper_Junos",
            "commands": {"lldp_brief": "show neighbors"}, "regexes": {"lldp_brief": BRIEF_RX},
        })
        again = CommandProfileService.get_profile_by_id(prof["id"])
        self.assertEqual((again["parser"], again["driver"]), ("custom", "juniper_junos"))
        self.assertEqual(again["commands"]["lldp_brief"], "show neighbors")
        self.assertEqual(again["commands"]["lldp_detail"], "")
        self.assertEqual(again["regexes"]["lldp_brief"], BRIEF_RX)

    def test_a_built_in_parser_names_no_driver(self):
        prof = CommandProfileService.create_profile({"name": "HW", "parser": "huawei", "driver": "cisco_ios"})
        self.assertEqual(prof["driver"], "")


class CustomDriverPlanTest(unittest.TestCase):
    def plan(self, profiles, driver=None, telnet=False):
        return [(d, [p["id"] for p in profs]) for d, profs in LldpService.driver_plan(profiles, driver, telnet)]

    def test_unknown_logs_in_with_the_driver_the_custom_profile_names(self):
        self.assertEqual(self.plan([HUAWEI, custom("juniper_junos")]),
                         [("huawei", ["c-hw"]), ("juniper_junos", ["c-my"])])

    def test_a_custom_profile_joins_the_login_of_its_driver(self):
        self.assertEqual(self.plan([HUAWEI, CISCO, custom("huawei")]),
                         [("huawei", ["c-hw", "c-my"]), ("cisco_ios", ["c-cs"])])

    def test_a_known_driver_runs_the_custom_profiles_written_for_it(self):
        self.assertEqual(self.plan([HUAWEI, custom("huawei")], "huawei"), [("huawei", ["c-hw", "c-my"])])
        self.assertEqual(self.plan([HUAWEI, custom("juniper_junos")], "juniper_junos"),
                         [("juniper_junos", ["c-my"])])
        self.assertEqual(self.plan([CISCO, custom("juniper_junos")], "cisco_ios"), [("cisco_ios", ["c-cs"])])

    def test_telnet_uses_the_telnet_variant_of_the_custom_driver(self):
        self.assertEqual(self.plan([custom("huawei")], "huawei", telnet=True), [("huawei_telnet", ["c-my"])])
        self.assertEqual(self.plan([custom("huawei")], telnet=True), [("huawei_telnet", ["c-my"])])

    def test_a_custom_profile_is_checked_against_its_drivers_vendor(self):
        self.assertEqual(LldpService.profile_vendor(custom("huawei")), "huawei")
        self.assertEqual(LldpService.profile_vendor(custom("cisco_ios")), "cisco")
        self.assertEqual(LldpService.profile_vendor(custom("juniper_junos")), "custom")
        self.assertEqual(LldpService.profile_vendor(HUAWEI), "huawei")


class FakeConn:
    def __init__(self, outputs):
        self.outputs = outputs
        self.sent = []

    def send_command(self, cmd, **kwargs):
        self.sent.append(cmd)
        return self.outputs.get(cmd, "")

    def find_prompt(self):
        return "<my-switch>"


class CustomCollectTest(unittest.TestCase):
    def collect(self, prof, outputs):
        conn = FakeConn(outputs)

        @contextmanager
        def fake_connect(device):
            yield conn, "test", []

        dev = DeviceCredentials(host="10.254.254.254", device_type="huawei", username="u", password="p")
        with patch.object(NetmikoService, "connect_with_fallback", side_effect=fake_connect):
            return LldpService.collect_device(dev, 0, driver="huawei", cmd_profiles=[prof]), conn.sent

    def profile(self, commands, regexes):
        base = {"pager_disable": "", "sysname": "", "version": "", "lldp_brief": "", "lldp_detail": "", "lldp_full": ""}
        return custom("huawei", commands=dict(base, **commands), regexes=regexes)

    def test_neighbors_come_from_the_brief_regex_alone(self):
        prof = self.profile({"lldp_brief": "show neighbors", "lldp_detail": "show neighbors detail"},
                            {"lldp_brief": BRIEF_RX})
        res, sent = self.collect(prof, {"show neighbors": BRIEF})
        self.assertTrue(res["success"], res["log"])
        self.assertEqual([(n["Local Port"], n["Remote Device"], n["Remote Port"], n["Remote IP"]) for n in res["neighbors"]],
                         [("p1", "core-sw", "xe-0/0/1", "10.1.1.1"), ("p2", "edge-02", "ge-0/0/7", "10.1.1.2")])
        # No detail regex: the detail command is not run, empty sysname / version commands are not sent
        self.assertEqual(sent, ["show neighbors"])
        self.assertEqual(res["hostname"], "my-switch")

    def test_a_detail_regex_fills_in_the_remote_model(self):
        prof = self.profile({"lldp_brief": "show neighbors", "lldp_detail": "show neighbors detail"},
                            {"lldp_brief": BRIEF_RX, "lldp_detail": DETAIL_RX})
        res, sent = self.collect(prof, {"show neighbors": BRIEF, "show neighbors detail": DETAIL})
        self.assertEqual([(n["Local Port"], n["Remote Model"]) for n in res["neighbors"]],
                         [("p1", "QFX5100-48S"), ("p2", "EX2300-24T")])
        self.assertEqual(sent.count("show neighbors detail"), 1)

    def test_a_rejected_command_still_moves_to_the_next_profile(self):
        prof = self.profile({"lldp_brief": "show neighbors"}, {"lldp_brief": BRIEF_RX})
        other = self.profile({"lldp_brief": "show lldp"}, {"lldp_brief": BRIEF_RX})
        other["name"] = "Second"
        conn = FakeConn({"show neighbors": "% Unrecognized command found at '^' position.", "show lldp": BRIEF})

        @contextmanager
        def fake_connect(device):
            yield conn, "test", []

        dev = DeviceCredentials(host="10.254.254.254", device_type="huawei", username="u", password="p")
        with patch.object(NetmikoService, "connect_with_fallback", side_effect=fake_connect):
            res = LldpService.collect_device(dev, 0, driver="huawei", cmd_profiles=[prof, other])
        self.assertEqual((res["command_profile"], res["neighbors_found"]), ("Second", 2))



class TestRegexEndpointTest(unittest.TestCase):
    """What the editor's live result shows: the scan's own parsing, plus why a pattern is unusable"""

    def run_test(self, pattern, default_local_port=None, output=BRIEF):
        from app.api.endpoints.command_profiles import test_custom_regex
        from app.schemas.command_profile import CustomRegexTest
        return test_custom_regex(CustomRegexTest(output=output, pattern=pattern, default_local_port=default_local_port))

    def test_rows_are_read_as_the_scan_reads_them(self):
        res = self.run_test(BRIEF_RX)
        self.assertIsNone(res.error)
        self.assertEqual([r["remote_device"] for r in res.rows], ["core-sw", "edge-02"])
        self.assertEqual(res.groups, ["local_port", "remote_device", "remote_port", "remote_ip"])

    def test_a_misspelt_group_is_named(self):
        res = self.run_test(r"^(?P<port>p\d+)")
        self.assertIn("port", res.error)
        self.assertEqual(res.rows, [])

    def test_a_missing_local_port_is_reported_unless_the_command_knows_it(self):
        self.assertIn("local_port", self.run_test(r"Model\s*:\s*(?P<remote_model>\S+)", output=DETAIL).error)
        res = self.run_test(r"Model\s*:\s*(?P<remote_model>\S+)", default_local_port="p1", output=DETAIL)
        self.assertIsNone(res.error)
        self.assertEqual(res.rows[0]["local_port"], "p1")

    def test_a_broken_or_empty_pattern_says_why(self):
        self.assertIn("Invalid regex", self.run_test("(?P<local_port>").error)
        self.assertIsNotNone(self.run_test("").error)


if __name__ == "__main__":
    unittest.main()
