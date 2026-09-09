#!/usr/bin/env python3
import sys
import csv
import random
from typing import Set

def generate_random_ip(used_ips: Set[str]) -> str:
    """Generate a unique private IPv4 address (avoiding network .0 and broadcast .255)"""
    while True:
        subnet_type = random.choice([10, 172, 192])
        if subnet_type == 10:
            ip = f"10.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"
        elif subnet_type == 172:
            ip = f"172.{random.randint(16, 31)}.{random.randint(0, 255)}.{random.randint(1, 254)}"
        else:
            ip = f"192.168.{random.randint(0, 255)}.{random.randint(1, 254)}"
            
        if ip not in used_ips:
            used_ips.add(ip)
            return ip

def generate_devices_csv(output_file: str, count: int):
    roles = ["SW-Core", "SW-Dist", "SW-Access", "SW-Agg", "RT-Core", "RT-Edge", "FW-Perim", "AP-WLAN"]
    sites = ["HQ", "DC1", "DC2", "BKK", "CNX", "HKT", "BR01", "BR02", "BR03", "BR04", "EAST", "WEST", "NORTH", "SOUTH"]
    
    used_ips: Set[str] = set()
    used_hostnames: Set[str] = set()
    
    devices = []
    
    id_counter = 1
    while len(devices) < count:
        role = random.choice(roles)
        site = random.choice(sites)
        hostname = f"{role}-{site}-{id_counter:05d}"
        id_counter += 1
        
        if hostname in used_hostnames:
            continue
        used_hostnames.add(hostname)
        
        ip = generate_random_ip(used_ips)
        devices.append((hostname, ip))
    
    random.shuffle(devices)
    
    with open(output_file, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["hostname", "ip"])
        for hostname, ip in devices:
            writer.writerow([hostname, ip])
            
    print(f"Successfully generated {len(devices)} unique devices to {output_file}")

if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10000
    out_file = sys.argv[2] if len(sys.argv) > 2 else f"devices_{count}.csv"
    generate_devices_csv(out_file, count)
