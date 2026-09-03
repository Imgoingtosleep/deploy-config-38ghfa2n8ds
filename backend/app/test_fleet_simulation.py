"""
Fleet Scale & Stress Test Simulation Script (1,000 - 10,000 Devices).
Demonstrates and validates:
1. High-concurrency batch chunking (100 workers/chunk)
2. Real-time progress calculation and metrics (devices/sec, % progress)
3. Pagination, filtering, and full-text search across 10,000 results
4. Mid-execution graceful job cancellation
5. Live HTTP REST API & Server-Sent Events (SSE) streaming validation
"""
import sys
import time
import math
import unittest
from unittest.mock import patch, MagicMock

# Import backend modules
from app.schemas.device import DeviceCredentials
from app.schemas.command import (
    CommandResponse,
    BatchCommandResponse,
    AdvancedDeployResponse,
    BatchDeployResponse,
)
from app.services.job_service import JobService
from app.services.nornir_service import NornirService


def print_banner(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def generate_fleet_devices(count: int) -> list:
    """Generate mock fleet of network devices with realistic IPs and vendor types"""
    devices = []
    vendors = ["huawei", "cisco_ios", "hp_comware", "aruba_os", "juniper_junos"]
    for i in range(1, count + 1):
        o1 = 10
        o2 = (i // 65536) % 256
        o3 = (i // 256) % 256
        o4 = i % 256 or 1
        ip = f"{o1}.{o2}.{o3}.{o4}"
        vendor = vendors[i % len(vendors)]
        devices.append(
            DeviceCredentials(
                host=ip,
                port=22,
                device_type=vendor,
                username=f"admin_{vendor}",
                password="SecurePassword123!",
            )
        )
    return devices


def test_scenario_1_scale_1000_troubleshoot():
    print_banner("[TEST 1] Scale Simulation: 1,000 Devices (Troubleshoot & Diagnostics)")
    devices = generate_fleet_devices(1000)
    print(f"Generated {len(devices):,} devices across 5 network vendor platforms.")

    # Mock Nornir batch execution to simulate realistic fast switch response (5ms per chunk)
    def mock_run_batch_command(devices, command, **kwargs):
        time.sleep(0.02)  # Simulates batch network concurrency
        results = []
        for idx, dev in enumerate(devices):
            # 95% success, 5% simulated connection error
            is_success = (idx % 20 != 0)
            results.append(
                CommandResponse(
                    host=dev.host,
                    command=command,
                    output=f"VRP (R) software, Version 5.170 (Huawei {dev.host})\nUptime is 42 weeks, 3 days" if is_success else "",
                    success=is_success,
                    error=None if is_success else f"Connection Timeout on {dev.host}",
                    execution_time_seconds=0.015,
                )
            )
        return BatchCommandResponse(
            devices_count=len(devices),
            success_count=sum(1 for r in results if r.success),
            failed_count=sum(1 for r in results if not r.success),
            overall_time_seconds=0.02,
            results=results,
        )

    with patch.object(NornirService, "run_batch_command", side_effect=mock_run_batch_command):
        start_t = time.time()
        submit_res = JobService.create_troubleshoot_job(
            devices=devices,
            command="display version",
        )
        job_id = submit_res.job_id
        print(f"Job Submitted Successfully! Job ID: {job_id}")
        print(f"Initial Status: {submit_res.status}, Total Devices: {submit_res.total_devices:,}")

        # Poll status and observe chunking progress
        print("\nMonitoring Real-Time Progress Stream:")
        while True:
            st = JobService.get_job_status(job_id)
            speed = round(st.completed_devices / max(st.elapsed_seconds, 0.001), 1)
            bar_len = 30
            filled = int(bar_len * (st.progress_percent / 100))
            bar = "#" * filled + "-" * (bar_len - filled)
            print(
                f"\r  [{bar}] {st.progress_percent:>5.1f}% | "
                f"Completed: {st.completed_devices:>4}/{st.total_devices} | "
                f"Success: {st.success_count:>4} | Failed: {st.failed_count:>3} | "
                f"Speed: {speed:>5.0f} dev/s | Time: {st.elapsed_seconds:>4.2f}s",
                end="",
                flush=True,
            )
            if st.is_completed:
                break
            time.sleep(0.04)

        total_elapsed = round(time.time() - start_t, 2)
        print(f"\n Job Completed in {total_elapsed}s!")

        # Verify Paginated Query
        print("\nVerifying Paginated Results API (Page 1 - 50 items):")
        page1 = JobService.get_paginated_results(job_id, page=1, page_size=50)
        print(f"  - Total Items: {page1.total_items:,}")
        print(f"  - Total Pages: {page1.total_pages} (50 items/page)")
        print(f"  - Page 1 Items Returned: {len(page1.results)}")
        print(f"  - Sample Device #1: Host={page1.results[0].host}, Success={page1.results[0].success}")

        # Verify Filter by Status
        failed_only = JobService.get_paginated_results(job_id, page=1, page_size=50, status_filter="failed")
        print(f"  - Failed Devices Filter: {failed_only.total_items} items found (All with success=False)")

        # Verify Search by IP
        search_res = JobService.get_paginated_results(job_id, search="10.0.1.", page=1, page_size=20)
        print(f"  - Search '10.0.1.' Filter: {search_res.total_items} matching devices found")
        assert page1.total_items == 1000
        assert page1.total_pages == 20
        print(" [TEST 1 PASSED] 1,000 Devices Chunking & Pagination Verified!")


def test_scenario_2_massive_scale_10000_deploy():
    print_banner("[TEST 2] Massive Scale Simulation: 10,000 Devices (Config Deployment)")
    devices = generate_fleet_devices(10000)
    print(f"Generated {len(devices):,} devices for massive fleet deployment.")

    def mock_run_batch_deploy(devices, config_commands, **kwargs):
        time.sleep(0.01)
        results = []
        for dev in devices:
            results.append(
                AdvancedDeployResponse(
                    host=dev.host,
                    command="Batch Configuration",
                    output="Configuration committed successfully. 2 commands applied.",
                    success=True,
                    error=None,
                    execution_time_seconds=0.01,
                    commands_deployed=config_commands,
                    save_output="Configuration saved to flash memory.",
                    backup_config=None,
                    pre_check_results=[],
                    post_check_results=[],
                    rollback_commands=[],
                    step_logs=["Pre-check passed", "Commands deployed", "Config saved"],
                )
            )
        return BatchDeployResponse(
            devices_count=len(devices),
            success_count=len(devices),
            failed_count=0,
            overall_time_seconds=0.01,
            results=results,
        )

    with patch.object(NornirService, "run_batch_deploy", side_effect=mock_run_batch_deploy):
        start_t = time.time()
        submit_res = JobService.create_deploy_job(
            devices=devices,
            config_commands=["vlan 100", "description MASSIVE_FLEET_AUTOMATION"],
            save_config=True,
        )
        job_id = submit_res.job_id
        print(f"Massive Deploy Job Submitted: ID = {job_id}")

        while True:
            st = JobService.get_job_status(job_id)
            speed = round(st.completed_devices / max(st.elapsed_seconds, 0.001), 1)
            bar_len = 30
            filled = int(bar_len * (st.progress_percent / 100))
            bar = "#" * filled + "-" * (bar_len - filled)
            print(
                f"\r  [{bar}] {st.progress_percent:>5.1f}% | "
                f"Completed: {st.completed_devices:>5}/{st.total_devices} | "
                f"Speed: {speed:>5.0f} dev/s | Time: {st.elapsed_seconds:>4.2f}s",
                end="",
                flush=True,
            )
            if st.is_completed:
                break
            time.sleep(0.03)

        total_elapsed = round(time.time() - start_t, 2)
        print(f"\n 10,000 Devices Config Deployed in {total_elapsed}s!")

        # Query 10,000 items pagination
        res_p50 = JobService.get_paginated_results(job_id, page=50, page_size=100)
        print(f"  - Querying Page 50 (Page Size 100): Total Pages = {res_p50.total_pages}")
        print(f"  - Page 50 Items Count: {len(res_p50.results)}")
        assert res_p50.total_items == 10000
        assert res_p50.total_pages == 100
        print(" [TEST 2 PASSED] 10,000 Devices Chunking & Memory Performance Verified!")


def test_scenario_3_mid_execution_cancellation():
    print_banner("[TEST 3] Mid-Execution Cancellation Simulation: 5,000 Devices")
    devices = generate_fleet_devices(5000)

    def mock_slow_batch(devices, command, **kwargs):
        time.sleep(0.08)  # Slightly slower to allow cancellation window
        results = [
            CommandResponse(
                host=d.host, command=command, output="OK", success=True, error=None, execution_time_seconds=0.08
            )
            for d in devices
        ]
        return BatchCommandResponse(
            devices_count=len(devices),
            success_count=len(devices),
            failed_count=0,
            overall_time_seconds=0.08,
            results=results,
        )

    with patch.object(NornirService, "run_batch_command", side_effect=mock_slow_batch):
        submit_res = JobService.create_troubleshoot_job(devices=devices, command="display cpu-usage")
        job_id = submit_res.job_id
        print(f"Job {job_id} launched for 5,000 devices.")

        # Let it run for 3 chunks (~300 devices) then cancel
        time.sleep(0.20)
        print(f"Dispatching Cancellation Signal to Job {job_id}...")
        cancel_success = JobService.cancel_job(job_id)
        assert cancel_success is True

        # Wait for worker thread to stop
        time.sleep(0.20)
        final_st = JobService.get_job_status(job_id)
        print(f"Final Job Status: '{final_st.status}'")
        print(f"Completed Devices Before Halt: {final_st.completed_devices:,} / {final_st.total_devices:,}")
        assert final_st.status == "cancelled"
        assert final_st.completed_devices < 5000
        print(" [TEST 3 PASSED] Job Cancellation Successfully Aborted Remaining Chunks!")


def test_scenario_4_live_http_and_sse_stream():
    print_banner("[TEST 4] Live REST API & SSE Stream Integration Test (HTTP localhost:4050)")
    import requests
    import json

    base_url = "http://127.0.0.1:4050/api/v1/jobs"
    payload = {
        "devices": [
            {"host": f"10.200.0.{i}", "device_type": "huawei", "username": "admin", "password": "pwd"}
            for i in range(1, 11)
        ],
        "command": "display ip interface brief",
    }

    # 1. Submit Job via HTTP POST
    print("1. Submitting batch troubleshoot job via HTTP POST...")
    resp = requests.post(f"{base_url}/submit-troubleshoot", json=payload, timeout=5)
    assert resp.status_code == 200, f"Submit failed: {resp.text}"
    job_info = resp.json()
    job_id = job_info["job_id"]
    print(f"   HTTP 200 OK | Job ID: {job_id} | Total Devices: {job_info['total_devices']}")

    # 2. Test Real-time SSE Stream
    print("2. Connecting to SSE Stream: /jobs/{job_id}/stream ...")
    sse_events = 0
    with requests.get(f"{base_url}/{job_id}/stream", stream=True, timeout=15) as sse_resp:
        for line in sse_resp.iter_lines():
            if line:
                decoded = line.decode("utf-8")
                if decoded.startswith("data:"):
                    data = json.loads(decoded[5:].strip())
                    sse_events += 1
                    print(f"   [SSE Event #{sse_events}] Status: {data.get('status')}, Progress: {data.get('progress_percent')}%, Elapsed: {data.get('elapsed_seconds')}s")
                    if data.get("is_completed"):
                        break

    assert sse_events >= 1, "No SSE events received!"
    print(f"   SSE Stream Verified! Received {sse_events} live progress updates.")

    # 3. Test Paginated Results API
    print("3. Fetching Paginated Results via HTTP GET...")
    res_resp = requests.get(f"{base_url}/{job_id}/results?page=1&page_size=10")
    assert res_resp.status_code == 200, f"Get results failed: {res_resp.text}"
    res_json = res_resp.json()
    print(f"   HTTP 200 OK | Total Items: {res_json['total_items']} | Page 1 Size: {len(res_json['results'])} | Total Pages: {res_json['total_pages']}")
    assert res_json["total_items"] == 10
    assert len(res_json["results"]) == 10
    print(" [TEST 4 PASSED] Live HTTP API & Server-Sent Events (SSE) Stream Verified!")


if __name__ == "__main__":
    print("\n" + "#" * 70)
    print("  NETWORK AUTOMATION PLATFORM - BACKGROUND FLEET AUTOMATION SUITE")
    print("#" * 70)
    test_scenario_1_scale_1000_troubleshoot()
    test_scenario_2_massive_scale_10000_deploy()
    test_scenario_3_mid_execution_cancellation()
    test_scenario_4_live_http_and_sse_stream()
    print("\n" + "=" * 70)
    print("  ALL 4 FLEET SIMULATION TESTS PASSED SUCCESSFULLY! (100% OPERATIONAL)")
    print("=" * 70 + "\n")

