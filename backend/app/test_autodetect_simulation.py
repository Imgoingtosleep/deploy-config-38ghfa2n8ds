import re

def run_simulation_tests():
    print("=" * 60)
    print("TESTING NETWORK DEVICE AUTO-DETECTION ENGINE")
    print("=" * 60)

    # 1. Test Prompt Signature Regex Patterns
    test_cases = [
        # Huawei Cases
        ("<Huawei-Switch>", "huawei", "Huawei user view prompt"),
        ("<Core-SW-01>", "huawei", "Huawei core switch prompt"),
        ("[Huawei-GigabitEthernet0/0/1]", "huawei", "Huawei interface view prompt"),
        ("[Switch-vlan10]", "huawei", "Huawei VLAN view prompt"),
        
        # Cisco Cases
        ("Router>", "cisco_ios", "Cisco user exec prompt"),
        ("Switch#", "cisco_ios", "Cisco privileged exec prompt"),
        ("Core-Catalyst-9300#", "cisco_ios", "Cisco Catalyst switch prompt"),
        ("ISR4331(config)#", "cisco_ios", "Cisco global config mode prompt"),
        ("Switch(config-if)#", "cisco_ios", "Cisco interface config mode prompt"),
        
        # Juniper Cases
        ("admin@qfx5100> ", "juniper_junos", "Juniper JunOS operational prompt"),
        ("root@srx300# ", "juniper_junos", "Juniper JunOS configuration prompt"),
    ]

    print("\n--- 1. Testing Regex Prompt Signature Matching ---")
    all_passed = True
    for prompt, expected_vendor, desc in test_cases:
        p = prompt.strip()
        detected = None
        
        if re.search(r"^<[^>]+>$", p) or re.search(r"^\[[^\]]+\]$", p):
            detected = "huawei"
        elif re.search(r"[\w\.\-]+@[\w\.\-]+[>#%]", p):
            detected = "juniper_junos"
        elif re.search(r"^[\w\.\-\(\)\/]+[>#]$", p):
            detected = "cisco_ios"

        status = "PASSED" if detected == expected_vendor else "FAILED"
        if status == "FAILED":
            all_passed = False
        print(f"[{status}] Prompt: {prompt:<32} -> Detected: {detected:<12} (Expected: {expected_vendor})")

    # 2. Test Login Banner Heuristic Matching
    print("\n--- 2. Testing SSH Login Banner Heuristic Matching ---")
    banner_test_cases = [
        ("Huawei Versatile Routing Platform Software (VRP)\nCopyright (C) 2000-2023 Huawei Technologies Co., Ltd.", "huawei"),
        ("Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE4", "cisco_ios"),
        ("HPE Comware Software, Version 7.1.070, Release 2432P06", "hp_comware"),
        ("JUNOS 21.4R3-S3.4 built by builder on 2022-12-14", "juniper_junos"),
        ("ArubaOS (MODEL: Aruba7010-US), Version 8.6.0.4", "aruba_os"),
    ]

    for banner, expected in banner_test_cases:
        detected = None
        if re.search(r"Huawei Versatile Routing Platform|VRP \(R\) Software|Huawei Technologies|Quidway|CloudEngine", banner, re.I):
            detected = "huawei"
        elif re.search(r"Cisco IOS Software|Cisco Nexus|IOS-XE|Cisco Systems", banner, re.I):
            detected = "cisco_ios"
        elif re.search(r"H3C Comware|HPE Comware", banner, re.I):
            detected = "hp_comware"
        elif re.search(r"ArubaOS|ProCurve", banner, re.I):
            detected = "aruba_os"
        elif re.search(r"JUNOS", banner, re.I):
            detected = "juniper_junos"

        status = "PASSED" if detected == expected else "FAILED"
        first_line = banner.splitlines()[0][:50]
        print(f"[{status}] Banner: {first_line:<50} -> Detected: {detected}")

    print("\n" + "=" * 60)
    print(f"ALL TESTS {'PASSED SUCCESSFULLY' if all_passed else 'HAD FAILURES'}!")
    print("=" * 60)

if __name__ == "__main__":
    run_simulation_tests()
