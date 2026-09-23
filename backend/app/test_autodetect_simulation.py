import re
import sys
import socket
from unittest.mock import MagicMock, patch
from app.services.autodetect_service import clean_ansi, AutoDetectService
from app.schemas.device import DeviceCredentials

def run_simulation_tests():
    print("=" * 80)
    print("COMPREHENSIVE MULTI-VENDOR AUTO-DETECTION TEST SUITE")
    print("Covering: Huawei, Cisco, HP (Comware), Aruba, Raisecom, Juniper, MikroTik")
    print("=" * 80)

    all_passed = True

    # 1. Test Prompt Signature Regex Patterns with ANSI Escape Codes
    test_cases = [
        # Huawei Cases (<...> or [...])
        ("<Huawei-Switch>", "huawei", "Huawei user view prompt"),
        ("\x1b[0m<Core-SW-01>\x1b[0m", "huawei", "Huawei core switch prompt with ANSI"),
        ("[Huawei-GigabitEthernet0/0/1]", "huawei", "Huawei interface view prompt"),
        ("\x1b[32m[Switch-vlan10]\x1b[0m", "huawei", "Huawei VLAN view prompt with ANSI color"),
        
        # Cisco IOS Cases (> or #)
        ("Router>", "cisco_ios", "Cisco user exec prompt"),
        ("\x1b[?25hSwitch# ", "cisco_ios", "Cisco privileged exec prompt with cursor code"),
        ("Core-Catalyst-9300#", "cisco_ios", "Cisco Catalyst switch prompt"),
        ("ISR4331(config)#", "cisco_ios", "Cisco global config mode prompt"),
        ("Switch(config-if)#", "cisco_ios", "Cisco interface config mode prompt"),
        
        # Cisco-style Prompt shared by Aruba and Raisecom
        ("Aruba-2930F#", "cisco_ios", "Aruba prompt (Cisco-style CLI prompt before probe)"),
        ("Raisecom#", "cisco_ios", "Raisecom prompt (Cisco-style CLI prompt before probe)"),
        ("ISCOM2600#", "cisco_ios", "Raisecom ISCOM prompt (Cisco-style CLI prompt before probe)"),

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
        ("ArubaOS (MODEL: Aruba7010-US), Version 8.6.0.4", "aruba_os"),
        ("ProCurve J9773A 2530-24G-PoEP Switch, revision YA.16.05.0004", "aruba_os"),
        ("Raisecom Technology Co., Ltd. ROS Software, Version 5.4.0\nISCOM2128-AC", "raisecom_roap"),
        ("JUNOS 21.4R3-S3.4 built by builder on 2022-12-14", "juniper_junos"),
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
        elif re.search(r"Raisecom Technology|ROS Software|ISCOM|RAX", b_clean, re.I):
            detected = "raisecom_roap"
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
        # Huawei vs HP Comware (Under 'display version')
        ("display version", "Huawei Versatile Routing Platform Software VRP (R) V200R019", "huawei"),
        ("display version", "HPE Comware Software, Version 7.1.070, Release 2432P06", "hp_comware"),
        ("display version", "H3C Comware Platform Software, Software Version 7.1.075", "hp_comware"),

        # Cisco vs Aruba vs Raisecom (Under 'show version')
        ("show version", "Cisco IOS Software, Catalyst 3850, Version 16.6.4", "cisco_ios"),
        ("show version", "Cisco Nexus Operating System (NX-OS) Software 9.3", "cisco_nxos"),
        ("show version", "ArubaOS-CX version FL.10.04.0001", "aruba_os"),
        ("show version", "ProCurve J9773A 2530-24G-PoEP Switch, revision YA.16.05.0004", "aruba_os"),
        ("show version", "Raisecom Technology Co., Ltd. ROS Software, Version 5.4.0 (ISCOM2600)", "raisecom_roap"),
        ("show version", "ISCOM2126EA-MA Gigabit Ethernet Switch, ROS Software Version 4.12", "raisecom_roap"),
        ("show version", "RAX711-C Carrier Ethernet Demarcation Device", "raisecom_roap"),
        ("show version", "Junos: 18.2R3-S2.9", "juniper_junos"),
    ]

    for cmd, output, expected in cmd_test_cases:
        detected = None
        c_clean = clean_ansi(output)
        if cmd == "display version":
            if re.search(r"Huawei|VRP|CloudEngine|Quidway", c_clean, re.I):
                detected = "huawei"
            elif re.search(r"H3C|Comware", c_clean, re.I):
                detected = "hp_comware"
        elif cmd == "show version":
            if re.search(r"NX-OS|Nexus", c_clean, re.I):
                detected = "cisco_nxos"
            elif re.search(r"Raisecom|ROS Software|ISCOM|RAX", c_clean, re.I):
                detected = "raisecom_roap"
            elif re.search(r"Cisco|IOS-XE|Cisco IOS", c_clean, re.I):
                detected = "cisco_ios"
            elif re.search(r"Aruba|ProCurve", c_clean, re.I):
                detected = "aruba_os"
            elif re.search(r"JUNOS|Juniper", c_clean, re.I):
                detected = "juniper_junos"
            elif re.search(r"Huawei|VRP", c_clean, re.I):
                detected = "huawei"

        status = "PASSED" if detected == expected else "FAILED"
        if status == "FAILED":
            all_passed = False
        print(f"[{status}] Cmd: {cmd:<16} | Out: {output[:36]:<38} -> Detected: {detected}")

    # 4. Mocked End-to-End SSH Session Simulation on All 5 Vendors
    print("\n--- 4. Mocked End-to-End SSH Session Simulation (All 5 Target Vendors) ---")
    mock_scenarios = [
        {
            "name": "Huawei AR/S-Series Switch",
            "prompt": "<Huawei-Core-SW>\r\n",
            "cmd_responses": {
                "display version\r\n": "Huawei Versatile Routing Platform Software\r\nVRP (R) software, Version 5.170 (V200R019C00)\r\n<Huawei-Core-SW>",
                "show version\r\n": "Error: Unrecognized command found at '^' position.\r\n<Huawei-Core-SW>",
            },
            "expected_type": "huawei",
        },
        {
            "name": "HP / H3C Comware Switch",
            "prompt": "<H3C-Switch>\r\n",
            "cmd_responses": {
                "display version\r\n": "HPE Comware Software, Version 7.1.070, Release 2432P06\r\nCopyright (c) 2010-2017 Hewlett Packard Enterprise Development LP\r\n<H3C-Switch>",
                "show version\r\n": "% Unrecognized command found at '^' position.\r\n<H3C-Switch>",
            },
            "expected_type": "hp_comware",
        },
        {
            "name": "Cisco Catalyst / IOS-XE Switch",
            "prompt": "Cisco-Core#\r\n",
            "cmd_responses": {
                "display version\r\n": "% Invalid input detected at '^' marker.\r\nCisco-Core#",
                "show version\r\n": "Cisco IOS Software, Catalyst L3 Switch Software (CAT3K_CAA-UNIVERSALK9-M), Version 16.6.4\r\nCisco-Core#",
            },
            "expected_type": "cisco_ios",
        },
        {
            "name": "Aruba / HP ProCurve Switch",
            "prompt": "Aruba-2930F#\r\n",
            "cmd_responses": {
                "display version\r\n": "Invalid input: display\r\nAruba-2930F#",
                "show version\r\n": "ArubaOS-CX Router Software Version FL.10.04.0001\r\nAruba-2930F#",
            },
            "expected_type": "aruba_os",
        },
        {
            "name": "Raisecom Switch (via Welcome Banner)",
            "prompt": "Raisecom-ISCOM#\r\n",
            "cmd_responses": {
                "display version\r\n": "% Invalid input detected at '^' marker.\r\nRaisecom-ISCOM#",
                "show version\r\n": "Raisecom Technology Co., Ltd.\r\nROS Software, Version 5.4.0\r\nISCOM2600G Series Gigabit Ethernet Switch\r\nRaisecom-ISCOM#",
            },
            "expected_type": "raisecom_roap",
        },
        {
            "name": "Raisecom Switch (Generic Prompt Switch#)",
            "prompt": "Switch#\r\n",
            "cmd_responses": {
                "display version\r\n": "% Invalid input detected at '^' marker.\r\nSwitch#",
                "show version\r\n": "Raisecom Technology Co., Ltd.\r\nROS Software, Version 5.4.0\r\nISCOM2600G Series Gigabit Ethernet Switch\r\nSwitch#",
            },
            "expected_type": "raisecom_roap",
        },
    ]

    for scenario in mock_scenarios:
        # Create a mock paramiko client
        mock_client = MagicMock()
        mock_channel = MagicMock()
        mock_transport = MagicMock()
        mock_transport.remote_version = "SSH-2.0-OpenSSH_8.2p1"
        mock_client.get_transport.return_value = mock_transport
        mock_client.invoke_shell.return_value = mock_channel

        # Simulate channel reads
        # When channel.send() is called, buffer appropriate output
        recv_queue = [scenario["prompt"]]
        
        def mock_send(data):
            resp = scenario["cmd_responses"].get(data, "\r\n")
            recv_queue.append(resp)
            return len(data)

        def mock_recv(n):
            if recv_queue:
                return recv_queue.pop(0).encode("utf-8")
            return b""

        def mock_recv_ready():
            return len(recv_queue) > 0

        mock_channel.send.side_effect = mock_send
        mock_channel.recv.side_effect = mock_recv
        mock_channel.recv_ready.side_effect = mock_recv_ready

        with patch("paramiko.SSHClient", return_value=mock_client):
            detected_type, reason = AutoDetectService._probe_via_ssh(
                host="10.254.254.254",
                port=22,
                username="admin",
                password="password",
                timeout=5,
            )

        status = "PASSED" if detected_type == scenario["expected_type"] else "FAILED"
        if status == "FAILED":
            all_passed = False
        print(f"[{status}] {scenario['name']:<36} -> Detected: {str(detected_type):<16} ({reason})")

    # 5. Test Multi-Vendor Model & Role Extraction
    print("\n--- 5. Testing Multi-Vendor Model & Role Extraction ---")
    from app.services.lldp_service import LldpService

    multi_vendor_model_cases = [
        # Raisecom Cases
        ("Raisecom", "ROS Software, Version 5.4.0\nISCOM2600G-4GE-AC Series Gigabit Ethernet Switch", "ISCOM2600G-4GE-AC", "switch"),
        ("Raisecom", "Raisecom Technology Co., Ltd.\nRAX711-C-AC Carrier Ethernet Demarcation Device, ROS Version 4.12", "RAX711-C-AC", "router"),
        ("Raisecom", "ROS Version 4.12\nISCOM2126EA-MA-AC Gigabit Switch", "ISCOM2126EA-MA-AC", "switch"),
        ("Raisecom", "Raisecom Operating System (ROS)\nRC002-16 Managed Chassis System", "RC002-16", "switch"),
        ("Raisecom", "ROS Software, Version 5.1.0\niTN201-10GE Multi-Service Demarcation Unit", "iTN201-10GE", "switch"),

        # Juniper Cases
        ("Juniper", "Hostname: core-qfx\nModel: qfx5100-48s-6q\nJunos: 18.2R3-S2.9", "qfx5100-48s-6q", "switch"),
        ("Juniper", "Hostname: branch-srx\nModel: srx300\nJunos: 21.4R3-S3.4", "srx300", "firewall"),
        ("Juniper", "Hostname: border-mx\nModel: mx240\nJunos: 20.2R3", "mx240", "router"),
        ("Juniper", "Hostname: access-ex\nModel: ex4300-48p\nJunos: 19.1R1", "ex4300-48p", "switch"),

        # Aruba / HP ProCurve Cases
        ("Aruba", "ProCurve J9773A 2530-24G-PoEP Switch, revision YA.16.05.0004", "2530-24G-PoEP", "switch"),
        ("Aruba", "Aruba 2930F-24G-4SFP+ Switch (JL259A), revision WC.16.08.0001", "2930F-24G-4SFP+", "switch"),
        ("Aruba", "Aruba 6300M 48G Class 4 PoE (JL665A), ArubaOS-CX FL.10.04.0001", "6300M", "switch"),
        ("Aruba", "ArubaOS (MODEL: Aruba7010-US), Version 8.6.0.4", "Aruba7010-US", "switch"),

        # HP / H3C Comware Cases
        ("HP/H3C", "H3C S5560X-30C-PWR-EI Switch uptime is 2 weeks", "S5560X-30C-PWR-EI", "switch"),
        ("HP/H3C", "HPE 5130 24G 4SFP+ EI Switch uptime is 10 weeks", "HPE 5130 24G 4SFP+ EI", "switch"),
        ("HP/H3C", "HPE FlexFabric 5900AF-48G-4XG-2QSFP+ Switch uptime is 4 weeks", "5900AF-48G-4XG-2QSFP+", "switch"),
        ("HP/H3C", "H3C MSR3610 Router Software, Version 7.1.064", "MSR3610", "router"),

        # MikroTik Cases
        ("MikroTik", "board-name: CCR1036-8G-2S+\nversion: 7.11 (stable)", "CCR1036-8G-2S+", "router"),
        ("MikroTik", "model: CRS326-24G-2S+\nversion: 7.6", "CRS326-24G-2S+", "switch"),
        ("MikroTik", "model: RB750Gr3\nversion: 6.49", "RB750Gr3", "router"),

        # Huawei & Cisco Cases
        ("Huawei", "HUAWEI S5720-28X-SI-AC Routing Switch uptime is 5 weeks", "S5720-28X-SI-AC", "switch"),
        ("Huawei", "Huawei Versatile Routing Platform Software\nAR1220F Router", "AR1220F", "router"),
        ("Huawei", "USG6530 Firewall uptime is 12 weeks", "USG6530", "firewall"),
        ("Cisco", "Model number : WS-C2960X-48TS-L\nSystem serial number", "WS-C2960X-48TS-L", "switch"),
        ("Cisco", "cisco ISR4331/K9 (1RU) processor with 1799787K/6147K bytes of memory.", "ISR4331", "router"),
    ]

    for vendor_label, raw_output, exp_model, exp_role in multi_vendor_model_cases:
        extracted = LldpService.extract_model(raw_output)
        role = LldpService.builtin_role(extracted)
        pass_model = (extracted == exp_model)
        pass_role = (role == exp_role)
        status = "PASSED" if (pass_model and pass_role) else "FAILED"
        if status == "FAILED":
            all_passed = False
        first_line = raw_output.splitlines()[0][:32]
        print(f"[{status}] [{vendor_label:<7}] Out: {repr(first_line):<35} -> Model: {extracted:<22} Role: {role:<8}")

    # 6. Quick Check on Lab Devices (if online)
    print("\n--- 6. Checking Lab Devices Connectivity (Non-blocking) ---")
    for ip in ["192.168.1.1", "192.168.1.2"]:
        # Quick 0.2s ping/port check
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.2)
        is_up = False
        try:
            sock.connect((ip, 22))
            is_up = True
            sock.close()
        except Exception:
            pass

        if is_up:
            dev = DeviceCredentials(host=ip, port=22, username="admin", password="Admin@123456")
            AutoDetectService.clear_cache()
            live_type, live_reason = AutoDetectService.detect_device_type(dev, timeout=5)
            print(f"[ONLINE] Target: {ip:<14} -> Detected Type: {live_type:<10} | Reason: {live_reason}")
        else:
            print(f"[OFFLINE/SKIPPED] Target {ip}: Port 22 not reachable in current environment (Simulated lab)")

    # 7. Test Unreachable / Offline / Auth Failed Host Behavior (Prevent Defaulting to Huawei)
    print("\n--- 7. Testing Offline, Unreachable & Auth-Failed Host Handling (No Default Huawei) ---")
    AutoDetectService.clear_cache()

    # Case 7.1: Truly unreachable host with credentials -> Must return 'unreachable'
    unreachable_dev = DeviceCredentials(host="192.0.2.1", port=22, username="admin", password="password")
    res_type, res_reason = AutoDetectService.detect_device_type(unreachable_dev, timeout=1)
    status_7_1 = "PASSED" if res_type == "unreachable" else "FAILED"
    if status_7_1 == "FAILED":
        all_passed = False
    print(f"[{status_7_1}] Unreachable Host (with credentials) -> Result: {res_type:<12} (Reason: {res_reason[:45]}...)")

    # Case 7.2: Truly unreachable host without credentials -> Must return 'unreachable'
    unreachable_no_creds = DeviceCredentials(host="192.0.2.1", port=22, username="", password="")
    res_type_no_creds, res_reason_no_creds = AutoDetectService.detect_device_type(unreachable_no_creds, timeout=1)
    status_7_2 = "PASSED" if res_type_no_creds == "unreachable" else "FAILED"
    if status_7_2 == "FAILED":
        all_passed = False
    print(f"[{status_7_2}] Unreachable Host (no credentials)   -> Result: {res_type_no_creds:<12} (Reason: {res_reason_no_creds[:45]}...)")

    # Case 7.3: Auth failure simulation -> Must return 'auth_failed'
    import paramiko
    with patch("paramiko.SSHClient.connect", side_effect=paramiko.ssh_exception.AuthenticationException("Auth failed")):
        auth_fail_dev = DeviceCredentials(host="10.10.10.10", port=22, username="wronguser", password="badpassword")
        res_auth_type, res_auth_reason = AutoDetectService.detect_device_type(auth_fail_dev, timeout=1)
        status_7_3 = "PASSED" if res_auth_type == "auth_failed" else "FAILED"
        if status_7_3 == "FAILED":
            all_passed = False
        print(f"[{status_7_3}] Auth Failure Simulation           -> Result: {res_auth_type:<12} (Reason: {res_auth_reason[:45]}...)")

    # Case 7.4: Reachable host but zero credentials -> Must return 'unknown'
    with patch("socket.socket.connect", return_value=None), \
         patch("app.services.netmiko_service.NetmikoService._resolve_credential_candidates", return_value=[]):
        no_cred_dev = DeviceCredentials(host="10.20.30.40", port=22, username="", password="")
        res_unknown_type, res_unknown_reason = AutoDetectService.detect_device_type(no_cred_dev, timeout=1)
        status_7_4 = "PASSED" if res_unknown_type == "unknown" else "FAILED"
        if status_7_4 == "FAILED":
            all_passed = False
        print(f"[{status_7_4}] Open Port Zero Credentials        -> Result: {res_unknown_type:<12} (Reason: {res_unknown_reason[:45]}...)")

    # Case 7.5: Authenticated but inconclusive vendor probe -> Must return 'unknown' (never huawei)
    with patch.object(AutoDetectService, "_probe_via_ssh", return_value=(None, "Inconclusive")), \
         patch.object(AutoDetectService, "_probe_prioritized_cli", return_value=(None, "Inconclusive")):
        inconclusive_dev = DeviceCredentials(host="10.20.30.50", port=22, username="admin", password="password")
        res_inc_type, res_inc_reason = AutoDetectService.detect_device_type(inconclusive_dev, timeout=1)
        status_7_5 = "PASSED" if res_inc_type == "unknown" else "FAILED"
        if status_7_5 == "FAILED":
            all_passed = False
        print(f"[{status_7_5}] Inconclusive Probe (Never Huawei)  -> Result: {res_inc_type:<12} (Reason: {res_inc_reason[:45]}...)")

    # Case 7.6: Cache protection test (unreachable/unknown/auth_failed must NEVER be cached)
    AutoDetectService.clear_cache()
    AutoDetectService.set_cached_type("1.1.1.1", "unreachable")
    AutoDetectService.set_cached_type("2.2.2.2", "auth_failed")
    AutoDetectService.set_cached_type("3.3.3.3", "unknown")
    AutoDetectService.set_cached_type("4.4.4.4", "huawei")
    cache_safe = (
        AutoDetectService.get_cached_type("1.1.1.1") is None and
        AutoDetectService.get_cached_type("2.2.2.2") is None and
        AutoDetectService.get_cached_type("3.3.3.3") is None and
        AutoDetectService.get_cached_type("4.4.4.4") == "huawei"
    )
    status_7_6 = "PASSED" if cache_safe else "FAILED"
    if status_7_6 == "FAILED":
        all_passed = False
    print(f"[{status_7_6}] Cache Non-Pollution Check        -> Result: {'Clean' if cache_safe else 'Leaked into Cache'}")

    print("\n" + "=" * 80)
    print(f"RESULT: ALL MULTI-VENDOR DETECTION TESTS {'PASSED 100% SUCCESSFULLY' if all_passed else 'HAD FAILURES'}!")
    print("=" * 80)
    return all_passed

if __name__ == "__main__":
    success = run_simulation_tests()
    sys.exit(0 if success else 1)
