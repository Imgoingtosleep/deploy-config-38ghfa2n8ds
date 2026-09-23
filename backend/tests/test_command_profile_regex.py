"""
Per-command regexes on an LLDP command profile.

A pattern with a capture group reads the value out of that command's output; a pattern
without one keeps only the matching lines before the parser runs. An empty, broken or
non-matching pattern leaves the built-in parsing in charge.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.services.command_profile_service as cps  # noqa: E402
from app.services.command_profile_service import REGEX_KEYS, CommandProfileService  # noqa: E402
from app.services.lldp_service import LldpService  # noqa: E402

VERSION_OUTPUT = """
Huawei Versatile Routing Platform Software
VRP (R) software, Version 5.170 (S5720 V200R019C00SPC500)
HUAWEI S5720-28X-SI-AC Routing Switch uptime is 120 days
"""

BRIEF_OUTPUT = """
Local Intf         Neighbor Dev        Neighbor Intf      Exptime
GE0/0/1            SW-Access-01        GE0/0/24           98
GE0/0/2            SW-Access-02        GE0/0/24           105
Total entries: 2
"""


class RegexCaptureTest(unittest.TestCase):
    def test_capture_group_returns_the_value(self):
        self.assertEqual(LldpService.regex_capture("  sysname switch_huawei\n", r"^\s*sysname\s+(\S+)"),
                         "switch_huawei")

    def test_pattern_without_a_group_returns_the_whole_match(self):
        self.assertEqual(LldpService.regex_capture(VERSION_OUTPUT, r"S5720-\S+"), "S5720-28X-SI-AC")

    def test_empty_broken_or_unmatched_patterns_return_none(self):
        self.assertIsNone(LldpService.regex_capture(VERSION_OUTPUT, ""))
        self.assertIsNone(LldpService.regex_capture(VERSION_OUTPUT, "(unclosed"))
        self.assertIsNone(LldpService.regex_capture(VERSION_OUTPUT, r"^NX-OS (\S+)"))

    def test_matching_is_case_insensitive_and_per_line(self):
        self.assertEqual(LldpService.regex_capture("HOSTNAME Core-01", r"^hostname\s+(\S+)"), "Core-01")


class RegexLinesTest(unittest.TestCase):
    def test_only_matching_lines_are_kept(self):
        kept = LldpService.regex_lines(BRIEF_OUTPUT, r"^(GE|XGE|Eth)")
        self.assertEqual(len(kept.splitlines()), 2)
        self.assertNotIn("Total entries", kept)

    def test_empty_broken_or_unmatched_patterns_return_none(self):
        self.assertIsNone(LldpService.regex_lines(BRIEF_OUTPUT, ""))
        self.assertIsNone(LldpService.regex_lines(BRIEF_OUTPUT, "[bad"))
        self.assertIsNone(LldpService.regex_lines(BRIEF_OUTPUT, r"^Nothing"))

    def test_the_table_header_survives_a_row_filter(self):
        """The brief parser reads its columns from the header, so dropping it would
        silently return zero neighbors"""
        kept = LldpService.regex_lines(BRIEF_OUTPUT, r"^(GE|XGE|Eth)")
        self.assertNotIn("Local Intf", kept)
        with_header = LldpService.keep_brief_header(BRIEF_OUTPUT, kept, "huawei")
        rows = LldpService.parse_lldp_brief(with_header, "huawei")
        self.assertEqual([r["local_port"] for r in rows], ["GE0/0/1", "GE0/0/2"])
        self.assertNotIn("Total entries", with_header)

    def test_a_filter_that_already_keeps_the_header_is_left_alone(self):
        kept = LldpService.regex_lines(BRIEF_OUTPUT, r"^(Local Intf|GE)")
        self.assertEqual(LldpService.keep_brief_header(BRIEF_OUTPUT, kept, "huawei"), kept)


class CommandProfileStorageTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._data_file = cps.DATA_FILE
        cps.DATA_FILE = os.path.join(self._tmp.name, "command_profiles.json")

    def tearDown(self):
        cps.DATA_FILE = self._data_file
        self._tmp.cleanup()

    def test_regexes_are_stored_and_updated(self):
        created = CommandProfileService.create_profile({
            "name": "Aruba OS-CX",
            "parser": "cisco",
            "commands": {"sysname": "show running-config | include hostname"},
            "regexes": {"sysname": r"^hostname\s+(\S+)"},
        })
        self.assertEqual(created["regexes"]["sysname"], r"^hostname\s+(\S+)")
        self.assertEqual(sorted(created["regexes"]), sorted(REGEX_KEYS))  # the other slots stay empty

        updated = CommandProfileService.update_profile(created["id"], {"regexes": {"version": r"(JL\d+[A-Z])"}})
        self.assertEqual(updated["regexes"]["version"], r"(JL\d+[A-Z])")
        self.assertEqual(updated["regexes"]["sysname"], "")  # a regexes update replaces the whole set

    def test_a_profile_saved_before_this_feature_still_loads(self):
        with open(cps.DATA_FILE, "w", encoding="utf-8") as f:
            f.write('[{"id": "cmdprof-old", "name": "Old", "parser": "huawei", "priority": 1, "enabled": true,'
                    ' "commands": {"sysname": "display current-configuration | include sysname"}}]')
        profile = CommandProfileService.get_profile_by_id("cmdprof-old")
        self.assertEqual(profile["regexes"], {k: "" for k in REGEX_KEYS})


if __name__ == "__main__":
    unittest.main()
