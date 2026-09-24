"""
Cisco vs Raisecom: both have a Cisco-style CLI, so the vendor comes from 'show version'.
RAISECOM_VER is what an ISCOM2608G (ROS 3.73) printed in the lab on 2026-09-24; the Cisco
texts follow IOS 15, IOS-XE 17, IOS 12 and NX-OS. Hostnames and banners that name the other
vendor must not decide.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.autodetect_service import match_version_output, prompt_hostname  # noqa: E402

RAISECOM_VER = """Raisecom Operating System Software
Copyright (c) 2006-2024 Raisecom Science & Technology Development Co.,Ltd

Product Name: ISCOM2608G-2GE-PWR-AC
Product Series: ISCOM2600G
Hardware Version: A.01
Software Version: 3.73.116(Compiled Dec 29 2023 15:19:48)
Bootrom Version: 1.20.13

System MAC Address: 000E.5E7B.864B
Protocol MAC Address: 000E.5E7B.864B
Serial number: 101625001201S17630S5049G
Device OID: 214
ISCOM2608G-2GE-PWR-AC with
256 M   bytes  DRAM
64  M   bytes  Flash Memory

System uptime is 0 days, 4 hours, 58 minutes
"""

IOS15 = """Cisco IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E4, RELEASE SOFTWARE (fc2)
Technical Support: http://www.cisco.com/techsupport
Copyright (c) 1986-2021 by Cisco Systems, Inc.
Compiled Wed 17-Mar-21 14:31 by prod_rel_team

ROM: Bootstrap program is C2960X boot loader
BOOTLDR: C2960X Boot Loader (C2960X-HBOOT-M) Version 15.2(3r)E1, RELEASE SOFTWARE (fc1)

{host} uptime is 2 weeks, 3 days, 4 hours, 5 minutes
System returned to ROM by power-on
System image file is "flash:c2960x-universalk9-mz.152-7.E4.bin"

cisco WS-C2960X-48TS-L (APM86XXX) processor (revision V0) with 524288K bytes of memory.
Processor board ID FOC1234X5YZ
Last reset from power-on
1 Virtual Ethernet interface
52 Gigabit Ethernet interfaces
Base ethernet MAC Address       : 70:DB:98:12:34:56
Model number                    : WS-C2960X-48TS-L
System serial number            : FOC1234X5YZ
Configuration register is 0xF
"""

IOSXE17 = """Cisco IOS XE Software, Version 17.03.04a
Cisco IOS Software [Amsterdam], Catalyst L3 Switch Software (CAT9K_IOSXE), Version 17.3.4a, RELEASE SOFTWARE (fc3)
Technical Support: http://www.cisco.com/techsupport
Copyright (c) 1986-2021 by Cisco Systems, Inc.
Compiled Tue 20-Jul-21 04:59 by mcpre

{host} uptime is 1 week, 2 days, 3 hours, 4 minutes
Uptime for this control processor is 1 week, 2 days, 3 hours, 6 minutes
cisco C9300-48P (X86) processor with 1419044K/6147K bytes of memory.
Processor board ID FOC2345Y6ZA
Configuration register is 0x102
"""

IOS12 = """Cisco Internetwork Operating System Software
IOS (tm) C2950 Software (C2950-I6Q4L2-M), Version 12.1(22)EA14, RELEASE SOFTWARE (fc1)
Copyright (c) 1986-2010 by cisco Systems, Inc.
Compiled Tue 26-Oct-10 10:35 by nburra

{host} uptime is 5 days, 1 hour, 2 minutes
System image file is "flash:/c2950-i6q4l2-mz.121-22.EA14.bin"
cisco WS-C2950-24 (RC32300) processor (revision R0) with 20957K bytes of memory.
Processor board ID FOC0712X1YZ
Configuration register is 0xF
"""

NXOS = """Cisco Nexus Operating System (NX-OS) Software
TAC support: http://www.cisco.com/tac
Copyright (C) 2002-2021, Cisco and/or its affiliates.
Software
  BIOS: version 07.69
  NXOS: version 9.3(8)
Hardware
  cisco Nexus9000 C93180YC-EX chassis
  Device name: {host}
"""


CASES = [
    ("Raisecom", RAISECOM_VER, "raisecom_roap"),
    ("SW-Floor3", RAISECOM_VER, "raisecom_roap"),
    ("core-cisco-uplink", RAISECOM_VER, "raisecom_roap"),
    ("Switch", IOS15, "cisco_ios"),
    ("C9300-core", IOSXE17, "cisco_ios"),
    ("Router", IOS12, "cisco_ios"),              # 'RC32300' CPU looks like a Raisecom RC model
    ("Raisecom-uplink", IOS15, "cisco_ios"),     # Cisco named after a Raisecom
    ("ISCOM2608G-mgmt", IOS15, "cisco_ios"),
    ("RAX711-edge", IOSXE17, "cisco_ios"),
    ("n9k-1", NXOS, "cisco_nxos"),
]


class CiscoVsRaisecomTest(unittest.TestCase):
    def test_show_version_names_the_vendor(self):
        for host, text, want in CASES:
            with self.subTest(host=host, want=want):
                output = f"show version\n{text.format(host=host)}{host}#"
                self.assertEqual(match_version_output(output, prompt_hostname(f"{host}#")), want)

    def test_a_raisecom_model_hostname_alone_is_not_a_vendor(self):
        # Nothing but the prompt and uptime line: no vendor, the hostname does not count
        self.assertIsNone(match_version_output("RAX1 uptime is 1 week\nRAX1#", "RAX1"))

    def test_prompt_hostname(self):
        self.assertEqual(prompt_hostname("Core-SW(config)#"), "Core-SW")
        self.assertEqual(prompt_hostname("ACC-01>"), "ACC-01")


if __name__ == "__main__":
    unittest.main()
