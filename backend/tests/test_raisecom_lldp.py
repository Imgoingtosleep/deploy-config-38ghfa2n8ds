"""
Raisecom ROS LLDP output, as an ISCOM2608G printed it (lab scan 2026-09-24): the brief table
of 'show lldp remote' and the 'X has N remotes:' blocks of 'show lldp remote detail'.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.lldp_service import LldpService  # noqa: E402

BRIEF = 'Port        ChassisId                PortId                    SysName                             MgtAddress               ExpiredTime\n---------------------------------------------------------------------------------------------------------------------------------------\nGE1/1/1     E028.6123.E198           Ethernet0/0/3             router_huawei                       192.168.1.1              102'

DETAIL = 'gigaethernet1/1/1 has  1 remotes:\nRemote 1\n--------------------------------------------------------------------------------\nChassisIdSubtype:             macAddress\nChassisId:                    E028.6123.E198\nPortIdSubtype:                ifName\nPortId:                       Ethernet0/0/3\nPortDesc:                     TO_RAISECOM_ISCOM2600G\nSysName:                      router_huawei\nSysDesc:                      Huawei AR1220F Huawei Versatile Routing Platform Sof\n                              tware  VRP (R) software,Version 5.170 (AR1200 V200R0\n                              10C10SPC700) Copyright (C) 2011-2020 Huawei Technolo\n                              gies Co., Ltd\nSysCapSupported:              Bridge/Switch\nSysCapEnabled:                Bridge/Switch\nMgt address:                  192.168.1.1\nExpired time:                 102(s)\nLLDPDU TTL:                   120\n\nAuto-negotiation supported:   Yes\nAuto-negotiation enabled:     Yes\nOperMau:                      speed(100)/duplex(Full)\n\nLink aggregation supported:   Yes\nLink aggregation enabled:     No\nAggregation port ID:          0\n\nMaximum frame Size:           1610\n\nHardwareRev:                  ARSRU1220F VER.B\nFirmwareRev:                  327\nSoftwareRev:                  V200R010C10SPC700\nSerialNum:                    N/A\nManufacturer name:            HUAWEI TECH CO., LTD\nModel name:                   N/A\nAsset tracking identifier:    N/A\n\ngigaethernet1/1/2 has  0 remotes:\ngigaethernet1/1/3 has  0 remotes:\ngigaethernet1/1/4 has  0 remotes:\ngigaethernet1/1/5 has  0 remotes:\ngigaethernet1/1/6 has  0 remotes:\ngigaethernet1/1/7 has  0 remotes:\ngigaethernet1/1/8 has  0 remotes:\ngigaethernet1/1/9 has  0 remotes:\ngigaethernet1/1/10 has  0 remotes:'


class RaisecomLldpTest(unittest.TestCase):
    def test_brief_table(self):
        rows = LldpService.parse_lldp_brief(BRIEF, "raisecom")
        self.assertEqual(
            [(r["local_port"], r["remote_device"], r["remote_port"], r["remote_ip"]) for r in rows],
            [("GE1/1/1", "router_huawei", "Ethernet0/0/3", "192.168.1.1")],
        )

    def test_detail_remotes_block(self):
        rows = LldpService.parse_detail(DETAIL, "raisecom")
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(
            (r["local_port"], r["remote_device"], r["remote_port"], r["remote_ip"], r["remote_model"]),
            ("gigaethernet1/1/1", "router_huawei", "Ethernet0/0/3", "192.168.1.1", "AR1220F"),
        )
        self.assertIn("Huawei Versatile Routing Platform", r["remote_description"])

    def test_detail_port_matches_the_brief_port(self):
        # Step 3 splits the detail by local port: GE1/1/1 (brief) == gigaethernet1/1/1 (detail)
        self.assertEqual(LldpService.intf_key("GE1/1/1"), LldpService.intf_key("gigaethernet1/1/1"))

    def test_neighbor_driver_from_the_description(self):
        r = LldpService.parse_detail(DETAIL, "raisecom")[0]
        self.assertEqual(LldpService.description_driver(r["remote_description"]), "huawei")


if __name__ == "__main__":
    unittest.main()
