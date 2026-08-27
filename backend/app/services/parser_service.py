import re
from typing import List, Dict, Any, Optional

class ParserService:
    @staticmethod
    def parse_version_info(raw_output: str, device_type: str) -> Dict[str, Any]:
        """Extract device model, OS version, uptime, and hostname from version output."""
        info = {
            "model": "Unknown Model",
            "version": "Unknown Version",
            "uptime": "Unknown Uptime",
            "serial": "N/A",
        }
        if not raw_output:
            return info

        # --- HUAWEI PARSER ---
        if "huawei" in device_type.lower():
            # Model e.g. "HUAWEI S5720-28P-SI-AC Routing Switch" or "S5700-28P-LI-AC"
            model_match = re.search(r"HUAWEI\s+([\w\-]+)\s+(?:Routing\s+)?Switch", raw_output, re.IGNORECASE)
            if not model_match:
                model_match = re.search(r"Device\s+name\s*:\s*([\w\-]+)", raw_output, re.IGNORECASE)
            if not model_match:
                model_match = re.search(r"PRODUCT\s+NAME\s*:\s*([\w\-]+)", raw_output, re.IGNORECASE)
            if model_match:
                info["model"] = model_match.group(1)

            # Version e.g. "VRP (R) software, Version 5.170 (V200R019C00SPC500)"
            ver_match = re.search(r"VRP\s*\(R\)\s*software,\s*Version\s*([\w\.\(\)]+)", raw_output, re.IGNORECASE)
            if ver_match:
                info["version"] = ver_match.group(1)

            # Uptime e.g. "HUAWEI S5720 uptime is 0 week, 0 day, 1 hour, 23 minutes"
            uptime_match = re.search(r"uptime\s+is\s+([^\r\n]+)", raw_output, re.IGNORECASE)
            if uptime_match:
                info["uptime"] = uptime_match.group(1).strip()

        # --- CISCO PARSER ---
        else:
            # Model e.g. "cisco WS-C2960X-24TD-L" or "Model number : WS-C3850-24T"
            model_match = re.search(r"[Cc]isco\s+([\w\-]+)\s+\(revision", raw_output)
            if not model_match:
                model_match = re.search(r"Model\s+(?:Number|number)\s*:\s*([\w\-]+)", raw_output)
            if model_match:
                info["model"] = model_match.group(1)

            # Version e.g. "Cisco IOS Software ... Version 15.2(2)E7"
            ver_match = re.search(r"Version\s+([\w\.\(\)\:]+),", raw_output)
            if ver_match:
                info["version"] = ver_match.group(1)

            # Uptime e.g. "Switch uptime is 2 weeks, 3 days, 4 hours, 12 minutes"
            uptime_match = re.search(r"uptime\s+is\s+([^\r\n]+)", raw_output, re.IGNORECASE)
            if uptime_match:
                info["uptime"] = uptime_match.group(1).strip()

        return info

    @staticmethod
    def parse_cpu_memory(cpu_output: str, mem_output: str, device_type: str) -> Dict[str, Any]:
        """Extract CPU utilization and Memory usage percentages."""
        data = {
            "cpu_percent": 0.0,
            "cpu_max_percent": 0.0,
            "memory_percent": 0.0,
            "memory_used_mb": None,
            "memory_total_mb": None,
        }

        # --- Parse CPU ---
        if cpu_output:
            # Huawei format: "CPU Usage : 12% Max: 45%" or "CPU utilization : 8%"
            huawei_cpu = re.search(r"CPU\s+Usage\s*:\s*(\d+)%(?:.*?Max\s*:\s*(\d+)%)?", cpu_output, re.IGNORECASE)
            if not huawei_cpu:
                huawei_cpu = re.search(r"CPU\s+(?:Usage|utilization)\s*(?:is)?\s*:\s*(\d+)%", cpu_output, re.IGNORECASE)
            
            # Cisco format: "five seconds: 12%/0%; one minute: 8%; five minutes: 6%"
            cisco_cpu = re.search(r"five\s+seconds\s*:\s*(\d+)%", cpu_output, re.IGNORECASE)

            if huawei_cpu:
                data["cpu_percent"] = float(huawei_cpu.group(1))
                if huawei_cpu.lastindex and huawei_cpu.lastindex >= 2 and huawei_cpu.group(2):
                    data["cpu_max_percent"] = float(huawei_cpu.group(2))
                else:
                    data["cpu_max_percent"] = data["cpu_percent"]
            elif cisco_cpu:
                data["cpu_percent"] = float(cisco_cpu.group(1))
                data["cpu_max_percent"] = data["cpu_percent"]

        # --- Parse Memory ---
        if mem_output:
            # Huawei format: "Memory Using Percentage Is: 32%" or "Memory Using Percentage : 32%"
            huawei_mem = re.search(r"Memory\s+Using\s+Percentage\s*(?:Is)?\s*:\s*(\d+)%", mem_output, re.IGNORECASE)
            
            # Cisco format: "Processor Pool Total: 12345678 Used: 4567890 Free: 7777788"
            cisco_mem = re.search(r"Total\s*:\s*(\d+)\s+Used\s*:\s*(\d+)", mem_output, re.IGNORECASE)

            if huawei_mem:
                data["memory_percent"] = float(huawei_mem.group(1))
            elif cisco_mem:
                total_bytes = float(cisco_mem.group(1))
                used_bytes = float(cisco_mem.group(2))
                if total_bytes > 0:
                    data["memory_percent"] = round((used_bytes / total_bytes) * 100, 1)
                    data["memory_total_mb"] = round(total_bytes / (1024 * 1024), 1)
                    data["memory_used_mb"] = round(used_bytes / (1024 * 1024), 1)

        return data

    @staticmethod
    def parse_interfaces(raw_output: str, device_type: str) -> Dict[str, Any]:
        """Extract total ports count, UP ports count, DOWN ports count."""
        summary = {
            "total_ports": 0,
            "up_count": 0,
            "down_count": 0,
            "ports": []
        }
        if not raw_output:
            return summary

        lines = raw_output.splitlines()
        for line in lines:
            line_str = line.strip()
            # Match physical interfaces e.g. GigabitEthernet0/0/1, GE0/0/1, FastEthernet0/1, Eth0/1, XGE0/0/1
            match_iface = re.search(
                r"^((?:GigabitEthernet|FastEthernet|TenGigabitEthernet|GE|XGE|Eth|FE|Gi|Te|Fa)\d+(?:/\d+)*)\s+(\S+)\s+(\S+)",
                line_str,
                re.IGNORECASE
            )
            if match_iface:
                port_name = match_iface.group(1)
                status_raw = match_iface.group(2).upper()
                proto_raw = match_iface.group(3).upper()

                is_up = "UP" in status_raw and ("UP" in proto_raw or "ROUTING" in proto_raw or "ENABLE" in proto_raw)
                
                summary["total_ports"] += 1
                if is_up:
                    summary["up_count"] += 1
                else:
                    summary["down_count"] += 1

                summary["ports"].append({
                    "port": port_name,
                    "status": "UP" if is_up else "DOWN",
                    "raw_status": status_raw,
                })

        return summary

    @staticmethod
    def parse_hardware_health(raw_output: str, device_type: str) -> Dict[str, Any]:
        """Check for Fan, Power Supply, and Temperature health status."""
        health = {
            "status": "HEALTHY",
            "fan": "Normal",
            "power": "Normal",
            "temperature": "Normal",
            "alerts": []
        }
        if not raw_output:
            return health

        # Check for Power faults
        if re.search(r"Power.*?\b(Fail|Fault|Abnormal|Off|Uninstalled|NoPower)\b", raw_output, re.IGNORECASE):
            health["power"] = "Warning / Fail"
            health["alerts"].append("Power supply status abnormal or unpowered")
            health["status"] = "WARNING"

        # Check for Fan faults
        if re.search(r"Fan.*?\b(Fail|Fault|Abnormal|Stop)\b", raw_output, re.IGNORECASE):
            health["fan"] = "Fault"
            health["alerts"].append("Fan status abnormal")
            health["status"] = "WARNING"

        # Check for Overheat
        if re.search(r"\b(Overheat|Temperature\s+High|High\s+Temp)\b", raw_output, re.IGNORECASE):
            health["temperature"] = "High Temp"
            health["alerts"].append("High temperature threshold exceeded")
            health["status"] = "CRITICAL"

        # Check for Optical signal loss or Transceiver alarms
        if re.search(r"\b(LOS|RX\s+Power\s+Low|Loss\s+of\s+signal|RX\s+Alarm|TX\s+Alarm)\b", raw_output, re.IGNORECASE):
            health["alerts"].append("Optical transceiver signal alarm / low Rx power detected")
            if health["status"] == "HEALTHY":
                health["status"] = "WARNING"

        if not health["alerts"]:
            health["alerts"].append("All hardware components operating within normal parameters")

        return health

    @classmethod
    def parse_health_summary(cls, command_results: List[Dict[str, Any]], device_type: str) -> Dict[str, Any]:
        """Synthesize multiple command outputs into one cohesive health dashboard summary."""
        version_text = ""
        cpu_text = ""
        mem_text = ""
        interface_text = ""
        hw_text = ""

        for res in command_results:
            cmd = res.get("command", "").lower()
            out = res.get("output", "")
            if not out:
                continue

            if "version" in cmd:
                version_text = out
            elif "cpu" in cmd:
                cpu_text = out
            elif "memory" in cmd or "mem" in cmd:
                mem_text = out
            elif "interface" in cmd or "int brief" in cmd or "status" in cmd:
                interface_text += "\n" + out
            elif "device" in cmd or "env" in cmd or "power" in cmd or "fan" in cmd or "temp" in cmd or "transceiver" in cmd or "optic" in cmd:
                hw_text += "\n" + out

        # If memory text was not in a separate command, check if it's in cpu or version output
        if not mem_text:
            mem_text = cpu_text or version_text

        device_info = cls.parse_version_info(version_text, device_type)
        performance = cls.parse_cpu_memory(cpu_text, mem_text, device_type)
        ports_summary = cls.parse_interfaces(interface_text, device_type)
        hw_health = cls.parse_hardware_health(hw_text, device_type)

        return {
            "device_info": device_info,
            "performance": performance,
            "ports_summary": ports_summary,
            "hardware_health": hw_health,
        }
