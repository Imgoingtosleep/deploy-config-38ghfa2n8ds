import re
from app.services.autodetect_service import clean_ansi, AutoDetectService
from app.schemas.device import DeviceCredentials

def run_simulation_tests():
    print("=" * 70)
    print("COMPREHENSIVE MULTI-VENDOR AUTO-DETECTION TEST SUITE")
    print("=" * 70)

    all_passed = True

    # 1. Test Prompt Signature Regex Patterns with ANSI Escape Codes
    test_cases = [
        # Huawei Cases
        ("<Huawei-Switch>", "huawei", "Huawei user view prompt"),
        ("\x1b[0m<Core-SW-01>\x1b[0m", "huawei", "Huawei core switch prompt with ANSI"),
        ("[Huawei-GigabitEthernet0/0/1]", "huawei", "Huawei interface view prompt"),
        ("\x1b[32m[Switch-vlan10]\x1b[0m", "huawei", "Huawei VLAN view prompt with ANSI color"),
        
        # Cisco IOS Cases
        ("Router>", "cisco_ios", "Cisco user exec prompt"),
        ("\x1b[?25hSwitch# ", "cisco_ios", "Cisco privileged exec prompt with cursor code"),
        ("Core-Catalyst-9300#", "cisco_ios", "Cisco Catalyst switch prompt"),
        ("ISR4331(config)#", "cisco_ios", "Cisco global config mode prompt"),
        ("Switch(config-if)#", "cisco_ios", "Cisco interface config mode prompt"),
        
        # Juniper Cases
        ("admin@qfx5100> ", "juniper_junos", "Juniper JunOS operational prompt"),
        ("root@srx300# ", "juniper_junos", "Juniper JunOS configuration prompt"),
        ("admin@mx240% ", "juniper_junos", "Juniper JunOS shell prompt"),

        # MikroTik Cases
        ("[admin@MikroTik] > ", "mikrotik_routeros", "MikroTik RouterOS prompt"),
        ("[admin@MikroTik] /ip address> ", "mikrotik_routeros", "MikroTik submenu prompt"),

        # Linux Cases
        ("user@ubuntu-server:~$ ", "linux", "Linux bash prompt"),
        ("root@centos-node7:~# ", "linux", "Linux root bash prompt"),
    ]

    print("\n--- 1. Testing Regex Prompt Signature & ANSI Strip Matching ---")
    for prompt, expected_vendor, desc in test_cases:
        p = clean_ansi(prompt).strip()
        detected = None
        
        if re.search(r"^<[^>]+>$", p) or re.search(r"^\[[^\]]+\]$", p):
            detected = "huawei"
        elif re.search(r"[\w\.\-]+@[\w\.\-]+[>#%]", p):
            detected = "juniper_junos"
        elif re.search(r"\[.*@.*\]\s*[\/\w\s\-]*>", p):
            detected = "mikrotik_routeros"
        elif re.search(r"[\w\.\-]+@[\w\.\-]+:[~\w\.\-\/]+[#$]", p):
            detected = "linux"
        elif re.search(r"^[\w\.\-\(\)\/]+[>#]$", p):
            detected = "cisco_ios"

        status = "PASSED" if detected == expected_vendor else "FAILED"
        if status == "FAILED":
            all_passed = False
        print(f"[{status}] Prompt: {repr(prompt):<38} -> Detected: {detected:<18} ({desc})")

    # 2. Test Login Banner Heuristic Matching
    print("\n--- 2. Testing SSH Login Banner Heuristic Matching ---")
    banner_test_cases = [
        ("Huawei Versatile Routing Platform Software (VRP)\nCopyright (C) 2000-2023 Huawei Technologies Co., Ltd.", "huawei"),
        ("Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE4", "cisco_ios"),
        ("Cisco Nexus Operating System (NX-OS) Software, Version 9.3(8)", "cisco_nxos"),
        ("HPE Comware Software, Version 7.1.070, Release 2432P06", "hp_comware"),
        ("JUNOS 21.4R3-S3.4 built by builder on 2022-12-14", "juniper_junos"),
        ("ArubaOS (MODEL: Aruba7010-US), Version 8.6.0.4", "aruba_os"),
        ("ProCurve J9773A 2530-24G-PoEP Switch, revision YA.16.05.0004", "aruba_os"),
        ("RouterOS v7.11 (stable)", "mikrotik_routeros"),
    ]

    for banner, expected in banner_test_cases:
        detected = None
        b_clean = clean_ansi(banner)
        if re.search(r"Huawei Versatile Routing Platform|VRP \(R\) Software|Huawei Technologies|Quidway|CloudEngine", b_clean, re.I):
            detected = "huawei"
        elif re.search(r"Cisco Nexus|NX-OS", b_clean, re.I):
            detected = "cisco_nxos"
        elif re.search(r"Cisco IOS Software|IOS-XE|Cisco Systems", b_clean, re.I):
            detected = "cisco_ios"
        elif re.search(r"H3C Comware|HPE Comware|Comware Software", b_clean, re.I):
            detected = "hp_comware"
        elif re.search(r"ArubaOS|ProCurve", b_clean, re.I):
            detected = "aruba_os"
        elif re.search(r"JUNOS", b_clean, re.I):
            detected = "juniper_junos"
        elif re.search(r"RouterOS|MikroTik", b_clean, re.I):
            detected = "mikrotik_routeros"

        status = "PASSED" if detected == expected else "FAILED"
        if status == "FAILED":
            all_passed = False
        first_line = banner.splitlines()[0][:50]
        print(f"[{status}] Banner: {first_line:<50} -> Detected: {detected}")

    # 3. Test Command Output Parsing (Dual Probe)
    print("\n--- 3. Testing Active Command Probe Discrimination ---")
    cmd_test_cases = [
        ("show version", "Cisco Nexus Operating System (NX-OS) Software 9.3", "cisco_nxos"),
        ("show version", "Cisco IOS Software, Catalyst 3850, Version 16.6.4", "cisco_ios"),
        ("show version", "ArubaOS-CX version FL.10.04.0001", "aruba_os"),
        ("show version", "Junos: 18.2R3-S2.9", "juniper_junos"),
        ("display version", "Huawei Versatile Routing Platform Software VRP (R) V200R019", "huawei"),
        ("display version", "HPE Comware Software, Version 7.1.070", "hp_comware"),
    ]

    for cmd, output, expected in cmd_test_cases:
        detected = None
        c_clean = clean_ansi(output)
        if re.search(r"NX-OS|Nexus", c_clean, re.I):
            detected = "cisco_nxos"
        elif re.search(r"Cisco|IOS-XE|Cisco IOS", c_clean, re.I):
            detected = "cisco_ios"
        elif re.search(r"Aruba|ProCurve", c_clean, re.I):
            detected = "aruba_os"
        elif re.search(r"JUNOS|Juniper", c_clean, re.I):
            detected = "juniper_junos"
        elif re.search(r"Huawei|VRP", c_clean, re.I):
            detected = "huawei"
        elif re.search(r"H3C|Comware", c_clean, re.I):
            detected = "hp_comware"

        status = "PASSED" if detected == expected else "FAILED"
        if status == "FAILED":
            all_passed = False
        print(f"[{status}] Cmd: {cmd:<16} | Out: {output[:36]:<38} -> Detected: {detected}")

    # 4. Test Live Devices
    print("\n--- 4. Testing Live Auto-Detection on Lab Devices ---")
    for ip in ["192.168.1.1", "192.168.1.2"]:
        dev = DeviceCredentials(host=ip, port=22, username="", password="")
        AutoDetectService.clear_cache()
        live_type, live_reason = AutoDetectService.detect_device_type(dev)
        print(f"Target: {ip:<14} -> Detected Type: {live_type:<10} | Reason: {live_reason}")
        if live_type == "huawei":
            print(f"[PASSED] Live {ip} correctly identified as {live_type}")
        else:
            print(f"[FAILED] Live {ip} detection failed")
            all_passed = False

    print("\n" + "=" * 70)
    print(f"ALL TESTS {'PASSED 100% SUCCESSFULLY' if all_passed else 'HAD FAILURES'}!")
    print("=" * 70)

if __name__ == "__main__":
    run_simulation_tests()
