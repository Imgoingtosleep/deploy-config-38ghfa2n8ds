# Network Automation & Diagnostic Web Platform

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4+-06B6D4?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Netmiko](https://img.shields.io/badge/Netmiko-4.3+-4B8BBE?style=flat)](https://github.com/ktbyers/netmiko)
[![Nornir](https://img.shields.io/badge/Nornir-3.4+-orange?style=flat)](https://nornir.readthedocs.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

เว็บแอปพลิเคชันระดับองค์กรสำหรับบริหารจัดการ, ตรวจสอบสถานะสุขภาพ (Health Check), วินิจฉัยและแก้ไขปัญหา (Troubleshoot) ตลอดจนปรับแต่งและกระจายการตั้งค่า (Deploy Configuration) บนอุปกรณ์เครือข่าย (Switch / Router / Firewall) แบบครบวงจร รองรับตั้งแต่ระดับรายเครื่อง (Single Device) จนถึงระดับกลุ่มขนาดใหญ่ระดับ **10,000+ อุปกรณ์ (Multi-Device Fleet Scalability)** พร้อมระบบแปลคำสั่งข้ามยี่ห้ออัตโนมัติ (Multi-Vendor Universal Command Translation Engine) ผ่าน Web UI ที่ทันสมัย รวดเร็ว และปลอดภัย

---

## สารบัญ (Table of Contents)
1. [สถาปัตยกรรมของระบบ (System Architecture)](#1-สถาปัตยกรรมของระบบ-system-architecture)
2. [ฟังก์ชันเด่นของระบบอย่างละเอียด (Key Features Deep Dive)](#2-ฟังก์ชันเด่นของระบบอย่างละเอียด-key-features-deep-dive)
   - [2.1 Multi-Vendor Command Translation Engine](#21-multi-vendor-command-translation-engine)
   - [2.2 Massive Fleet Scalability (10,000+ Devices Engine)](#22-massive-fleet-scalability-10000-devices-engine)
   - [2.3 Asynchronous Job Queue & Real-time SSE Stream](#23-asynchronous-job-queue--real-time-sse-stream)
   - [2.4 Dual-Report & ZIP Export Engine](#24-dual-report--zip-export-engine)
   - [2.5 Advanced Inventory Import Engine](#25-advanced-inventory-import-engine)
   - [2.6 4 โมดูลปฏิบัติการหลัก (Health Check, Troubleshoot, Deploy, Template Studio)](#26-4-โมดูลปฏิบัติการหลัก)
3. [โครงสร้างโปรเจกต์ (Project Structure)](#3-โครงสร้างโปรเจกต์-project-structure)
4. [ตารางเปรียบเทียบคำสั่ง 7 แพลตฟอร์ม (Command Equivalents Matrix)](#4-ตารางเปรียบเทียบคำสั่ง-7-แพลตฟอร์ม-command-equivalents-matrix)
5. [สคริปต์สุ่มสร้างข้อมูลอุปกรณ์จำลอง (Mock Device Generator)](#5-สคริปต์สุ่มสร้างข้อมูลอุปกรณ์จำลอง-mock-device-generator)
6. [รูปแบบไฟล์สำหรับนำเข้ารายชื่ออุปกรณ์ (Inventory Import Formats)](#6-รูปแบบไฟล์สำหรับนำเข้ารายชื่ออุปกรณ์-inventory-import-formats)
7. [ไดรเวอร์อุปกรณ์เครือข่ายที่รองรับ (Supported Device Drivers)](#7-ไดรเวอร์อุปกรณ์เครือข่ายที่รองรับ-supported-device-drivers)
8. [คู่มือการตั้งค่าอุปกรณ์เครือข่ายจริง (Network Equipment Setup Guide)](#8-คู่มือการตั้งค่าอุปกรณ์เครือข่ายจริง-network-equipment-setup-guide)
9. [การตั้งค่า Environment Variables (.env)](#9-การตั้งค่า-environment-variables-env)
10. [วิธีการติดตั้งและเริ่มต้นใช้งาน (Installation & Quick Start)](#10-วิธีการติดตั้งและเริ่มต้นใช้งาน-installation--quick-start)
11. [REST API Reference ฉบับสมบูรณ์](#11-rest-api-reference-ฉบับสมบูรณ์)
12. [การปรับแต่งประสิทธิภาพระดับหมื่นเครื่อง (Performance & Kernel Tuning)](#12-การปรับแต่งประสิทธิภาพระดับหมื่นเครื่อง-performance--kernel-tuning)
13. [มาตรฐานความปลอดภัย (Security & Enterprise Hardening)](#13-มาตรฐานความปลอดภัย-security--enterprise-hardening)
14. [การแก้ไขปัญหาที่พบบ่อย (Troubleshooting & FAQ)](#14-การแก้ไขปัญหาที่พบบ่อย-troubleshooting--faq)

---

## 1. สถาปัตยกรรมของระบบ (System Architecture)

ระบบถูกออกแบบด้วยสถาปัตยกรรมแบบ Decoupled Client-Server โดยแยกการทำงานระหว่าง Web Frontend ที่ตอบสนองรวดเร็ว และ High-Concurrency Async Backend ที่เชื่อมต่อไปยังอุปกรณ์เครือข่าย:

```mermaid
flowchart TD
    subgraph Client ["Frontend Layer (React 18 + Vite + Tailwind CSS)"]
        UI["Web UI Single Page Application
(Port 4000)"]
        UI -->|Mode: Single Device| DevForm["Single Device Control Panel
(Real-time CLI Terminal)"]
        UI -->|Mode: Fleet (10,000+)| FleetForm["Fleet Control Panel
(Batch Setup + Worker Slider)"]
        UI --> ModalJob["Async Job Monitor Modal
(Real-time SSE EventStream)"]
    end

    subgraph Backend ["Backend Layer (Python FastAPI - Port 4050)"]
        API["FastAPI App Router
(/api/v1)"]
        
        API --> Endpoints
        subgraph Endpoints ["API Router Endpoints"]
            EP_Dev["/devices
(Connect, Auto-detect, Import, Templates)"]
            EP_Job["/jobs
(SSE Stream, Status, Cancel, Export ZIP)"]
            EP_HC["/healthcheck
(Single & Fleet Metrics)"]
            EP_TB["/troubleshoot
(Interactive CLI, Ping, Trace, Log Filter)"]
            EP_DP["/deploy
(Pre/Post Check, Backup, Rollback)"]
            EP_Sys["/system
(Nornir Dynamic Worker Tuning)"]
            EP_PB["/playbooks & /templates
(CRUD & Jinja2 Engine)"]
        end

        subgraph Engines ["Core Services & Automation Engines"]
            CT["Command Translator Engine
(Universal Pivot: Huawei VRP)"]
            IP["Inventory Parser Engine
(CSV / Excel / JSON / YAML / TXT)"]
            JS["Job Service Manager
(Background Queue & SSE Broadcast)"]
            NR["Nornir Multithreaded Engine
(Dynamic In-Memory Inventory)"]
            NM["Netmiko Driver Layer
(SSH / Telnet / Serial Drivers)"]
            AD["Auto-Detect Engine
(Banner / Prompt Heuristics)"]
            PR["Parser Service
(Regex CPU, Mem, Interface Status)"]
        end

        Endpoints --> Engines
    end

    subgraph NetworkFleet ["Target Network Infrastructure"]
        D_HW["Huawei VRP
(CloudEngine / Quidway / AR / USG)"]
        D_CS["Cisco IOS / XE / NX-OS
(Catalyst / Nexus / ISR / ASR)"]
        D_JN["Juniper JunOS
(EX / QFX / SRX)"]
        D_AR["HPE Aruba
(ArubaOS-CX / ProCurve)"]
        D_CW["HP / H3C Comware
(FlexNetwork 5130/5510/5900)"]
        D_MT["MikroTik RouterOS
(CRS / CCR)"]
    end

    Engines --> NetworkFleet
    ModalJob -.->|Listen SSE Stream| JS
    JS -->|Generate Reports| ExportZip["ZIP Report Archive
├── report_summary.csv
├── report_per_device.csv
├── raw_logs/
└── regex_logs/"]
```

---

## 2. ฟังก์ชันเด่นของระบบอย่างละเอียด (Key Features Deep Dive)

### 2.1 Multi-Vendor Command Translation Engine
ระบบใช้ **Huawei VRP Syntax (`display ...`)** เป็นแกนกลางสากล (Universal Pivot) ช่วยให้วิศวกรเครือข่ายพิมพ์คำสั่งเพียงรูปแบบเดียว แต่ส่งไปรันบนอุปกรณ์ต่างค่ายได้ทันที:
- **Heuristic Parameter Translation**: ไม่เพียงแปลคำสั่งสถิต แต่ยังวิเคราะห์ Parameter ต่อท้าย เช่น:
  - `display ip routing-table 10.50.0.0` -> `show ip route 10.50.0.0` (Cisco) -> `show route 10.50.0.0` (Juniper) -> `/ip route print where dst-address in 10.50.0.0` (MikroTik)
  - `display arp 192.168.1.1` -> `show ip arp 192.168.1.1` (Cisco) -> `show arp no-resolve hostname 192.168.1.1` (Juniper)
- **Interface & Link Aggregation Normalization**:
  - `Eth-Trunk 10` (Huawei) <-> `Port-channel 10` (Cisco) <-> `ae10` (Juniper) <-> `Bridge-Aggregation 10` (Comware) <-> `bonding` (MikroTik)
- **CLI Shorthand Expansion**:
  - ผู้ใช้งานสามารถพิมพ์ตัวย่อที่คุ้นเคย เช่น `dis ver`, `disp cur`, `sh ip int br`, `sh run` ระบบจะ Normalize เป็นคำสั่งทางการก่อนประมวลผล

### 2.2 Massive Fleet Scalability (10,000+ Devices Engine)
- **In-Memory Dynamic Inventory (Nornir 3.x)**: ไม่ต้องเขียนไฟล์ YAML ลงดิสก์ในระหว่างรัน ช่วยขจัดปัญหา Disk I/O Bottleneck เมื่อจัดการอุปกรณ์ระดับหลักพันถึงหลักหมื่นเครื่อง
- **Dynamic Concurrent Worker Pool**: ปรับตั้งจำนวน Worker ได้ตั้งแต่ 1 ถึง 100 Workers ผ่านหน้าจอ UI หรือ API เพื่อให้เหมาะสมกับสเปก Server และขีดจำกัด Bandwidth
- **Smart Batch Chunking**: แบ่งชุดอุปกรณ์ออกเป็น Chunk ย่อย (เช่น 50-100 เครื่องต่อรอบ) ป้องกันปัญหา Socket Exhaustion และ Memory Leak ในระบบเครือข่าย
- **Paramiko Enterprise Compatibility**: รองรับอัลกอริทึม SSH ทั้งสมัยใหม่และ Legacy (`diffie-hellman-group14-sha1`, `diffie-hellman-group1-sha1`, `rsa-sha2-512`, `rsa`) ทำให้เชื่อมต่อ Switch รุ่นเก่าและรุ่นใหม่ได้พร้อมกันอย่างไร้รอยต่อ

### 2.3 Asynchronous Job Queue & Real-time SSE Stream
- สั่งรันงานบน Fleet แล้วรับ `job_id` ทันที โดยหน้าเว็บไม่บล็อกหรือค้าง (Non-blocking Asynchronous Execution)
- ติดตามสถานะผ่าน **Server-Sent Events (SSE)** ส่งข้อมูลสถานะสด:
  - เปอร์เซ็นต์ความคืบหน้า (Progress Bar 0-100%)
  - ตัวนับสถานะเรียลไทม์: Total, Completed, Running, Success, Failed
  - เวลาที่ใช้ไปแล้ว (Elapsed Time) และการคาดการณ์เวลาที่เหลือ (Estimated Time Arrival - ETA)
  - ความเร็วการประมวลผล (Devices per Second)
- **Graceful Cancellation**: มีปุ่มสั่งหยุดงาน (Cancel) ได้ทันทีอย่างปลอดภัยระหว่างรอบ Chunking

### 2.4 Dual-Report & ZIP Export Engine
เมื่องานเสร็จสิ้น ระบบสามารถ Export ผลลัพธ์ออกมาเป็นไฟล์ ZIP สมบูรณ์แบบ ประกอบด้วย:
1. **`report_summary.csv`**: ตารางสรุปภาพรวมของงาน (Job ID, Start Time, End Time, Total Devices, Success Count, Failed Count, Duration Seconds, Success Rate %)
2. **`report_per_device.csv`**: รายละเอียดแยกรายอุปกรณ์:
   - `hostname_import`: Hostname ตามที่ผู้ใช้ระบุหรือนำเข้าจากไฟล์
   - `sysname_device`: Prompt / System Name จริงที่อ่านได้จาก CLI ของอุปกรณ์
   - `ip`: IP Address
   - `result`: สถานะ (`SUCCESS` หรือ `FAILED`)
   - `detail`: ข้อมูลสรุปหรือ Error Message
3. **`raw_logs/{host}_{hostname}.txt`**: ข้อความดิบทั้งหมดที่อุปกรณ์ตอบกลับ
4. **`regex_logs/{host}_{hostname}.txt`**: ข้อความเฉพาะส่วนสำคัญที่ผ่านการกรอง

### 2.5 Advanced Inventory Import Engine
- **Dual Column Support**: รองรับทั้งคอลัมน์ `hostname` และ `ip` (หรือระบุเฉพาะ `ip` ก็ได้)
- **Auto Delimiter & Encoding Detection**: รองรับตัวคั่น `,`, `;`, `\t` และระบบตรวจจับ Encoding อัตโนมัติ (`utf-8-sig`, `utf-8`, `latin-1`, `cp1252`)
- **5 รูปแบบไฟล์**: CSV, Excel (`.xlsx`, `.xls`), JSON, YAML, และ Plain Text (`.txt`)
- **Replace vs Append Mode**: เลือกระหว่างแทนที่อุปกรณ์ทั้งหมด หรือเพิ่มต่อท้ายจากรายการเดิม

### 2.6 4 โมดูลปฏิบัติการหลัก
1. **Health Check**:
   - ตรวจ 6 หมวดหมู่มาตรฐาน: Standard Health, Interfaces, Transceiver/Optics, Environment, Routing & ARP, System Logs
   - Regex Metrics Parser: คำนวณสรุปค่า **CPU Utilization (%)**, **Memory Usage (%)**, และ **Active Interfaces**
2. **Troubleshoot & Interactive CLI**:
   - หน้าต่าง Console สำหรับพิมพ์คำสั่งโต้ตอบ แสดงผลทันที
   - ระบบ Ping และ Traceroute ข้ามยี่ห้อ
   - Log Filter กรอง Syslog ตาม Keyword สำคัญ
   - Runner สำหรับรัน Saved Profiles / Playbooks
3. **Deploy Configuration**:
   - Pre-Checks & Post-Checks ตรวจสอบก่อน-หลังเปลี่ยนคอนฟิก
   - Automated Running-Config Backup เก็บประวัติก่อนเริ่มงาน
   - Dynamic Rollback Generator สร้างคำสั่งย้อนกลับอัตโนมัติ
   - Error Pattern Detection ตรวจจับข้อผิดพลาด CLI อัตโนมัติ
   - Automated Save / Commit บันทึกลง NVRAM
4. **Template Studio**:
   - ออกแบบ Jinja2 Templates พร้อมรองรับตัวแปร YAML/JSON
   - ระบบเรนเดอร์ดูผลลัพธ์แบบ Live Preview ก่อน Deploy จริง

---

## 3. โครงสร้างโปรเจกต์ (Project Structure)

```text
deploy-config/
├── .env                              # ไฟล์คอนฟิกระบบหลัก (Ports, Hosts, Timeouts, Workers)
├── .env.example                      # ตัวอย่างไฟล์คอนฟิกสำหรับ Clone โปรเจกต์
├── .gitignore                        # ป้องกันการบันทึก Secrets, Cache, และข้อมูลชั่วคราว
├── docker-compose.yml                # Docker Compose Orchestration (Frontend + Backend)
├── NETWORK_SETUP_GUIDE.md            # คู่มือการเตรียมเครือข่ายและคำสั่งคอนฟิกบนอุปกรณ์จริง
├── README.md                         # คู่มือและเอกสารการใช้งานระบบฉบับสมบูรณ์
├── generate_devices.py               # สคริปต์สุ่มสร้างข้อมูลอุปกรณ์จำลอง (1,000 - 10,000+ devices)
├── devices_1000.csv                  # ตัวอย่างชุดข้อมูลทดสอบ 1,000 อุปกรณ์
├── devices_10000.csv                 # ตัวอย่างชุดข้อมูลทดสอบ 10,000 อุปกรณ์
│
├── backend/                          # Python FastAPI Backend Service
│   ├── Dockerfile                    # Container definition (Python 3.11-slim)
│   ├── requirements.txt              # FastAPI, Netmiko, Nornir, Paramiko, openpyxl, pyyaml
│   ├── test_fleet_simulation.py      # สคริปต์จำลองทดสอบประสิทธิภาพ Fleet 10,000 เครื่อง
│   └── app/
│       ├── main.py                   # FastAPI Application Entrypoint & CORS Middleware
│       ├── test_autodetect_simulation.py # สคริปต์ทดสอบจำลอง Auto-detect Device Type
│       ├── core/
│       │   └── config.py             # ตั้งค่าระบบและโหลด Environment Variables จาก .env
│       ├── data/                     # ที่เก็บข้อมูลถาวร (Persistent JSON Storage)
│       │   ├── playbooks.json        # บันทึก Command Playbooks / Profiles
│       │   └── templates.json        # บันทึก Jinja2 Configuration Templates
│       ├── schemas/                  # Pydantic Data Models & Validation
│       │   ├── command.py            # สกีมาสำหรับ Single/Batch Command, Health Check, Workers
│       │   ├── device.py             # สกีมาสำหรับ Device Credentials, Connection Test, Fleet
│       │   ├── playbook.py           # สกีมาสำหรับ Command Profiles และ Auto-Translate API
│       │   └── template.py           # สกีมาสำหรับ Jinja2 Config Templates
│       ├── services/                 # Core Automation Engines & Network Drivers
│       │   ├── autodetect_service.py # วิเคราะห์และตรวจจับประเภทอุปกรณ์ (Device Type) อัตโนมัติ
│       │   ├── command_translator.py # เครื่องยนต์แปลคำสั่ง 7 แพลตฟอร์มเครือข่าย (Universal Pivot)
│       │   ├── inventory_parser.py   # ตัวถอดรหัสไฟล์ CSV, XLSX, JSON, YAML, TXT
│       │   ├── job_service.py        # จัดการคิวงาน Background Async Job, Chunking, SSE Stream
│       │   ├── netmiko_service.py    # ไดรเวอร์ SSH/Telnet/Serial และ Credential Masking
│       │   ├── nornir_service.py     # Multithreaded Engine สำหรับรันงานบน Fleet ขนานพร้อมกัน
│       │   ├── parser_service.py     # ตัววิเคราะห์ Regex สรุป Version, CPU, Memory, Interfaces
│       │   ├── playbook_service.py   # จัดการ CRUD บันทึก/แก้ไข/ลบโปรไฟล์คำสั่ง Multi-Vendor
│       │   └── template_service.py   # จัดการเรนเดอร์และบันทึก Jinja2 Config Templates
│       └── api/
│           └── endpoints/            # REST API Router Endpoints
│               ├── deploy.py         # พุชคอนฟิก, Pre/Post Check, Backup, และ Rollback
│               ├── devices.py        # ทดสอบการเชื่อมต่อ, Auto-detect, นำเข้าไฟล์, ดาวน์โหลด Template
│               ├── healthcheck.py    # ตรวจสอบสุขภาพอุปกรณ์ (Single และ Fleet)
│               ├── jobs.py           # ตรวจสอบสถานะ Job, Real-time SSE Stream, ส่งออก ZIP Report
│               ├── playbooks.py      # จัดการ Playbooks และเรียกใช้ระบบแปลคำสั่งอัตโนมัติ
│               ├── profiles.py       # จัดการโปรไฟล์ชุดคำสั่งเพิ่มเติม
│               ├── system.py         # ดูและปรับเปลี่ยนจำนวน Nornir Concurrent Workers แบบไดนามิก
│               ├── templates.py      # จัดการและเรนเดอร์ Jinja2 Templates
│               └── troubleshoot.py   # Interactive CLI, Ping, Traceroute, และ Log Filter
│
└── frontend/                         # React Frontend (Vite + TailwindCSS)
    ├── Dockerfile                    # Multi-stage production build ด้วย Nginx
    ├── Dockerfile.dev                # Development container สำหรับ Live Reload
    ├── nginx.conf                    # การตั้งค่า Nginx Reverse Proxy & Static Hosting
    ├── package.json                  # รายการ Dependencies (React 18, Vite, TailwindCSS, Lucide)
    ├── vite.config.js                # การตั้งค่า Vite Dev Server (Port 4000) และ Proxy
    ├── tailwind.config.js            # การตั้งค่าชุดสีและธีม Enterprise Dark Theme
    └── src/
        ├── App.jsx & App.css         # คอมโพเนนต์หลัก จัดการแท็บเมนูและสถานะระบบ
        ├── main.jsx & index.css      # จุดเริ่มต้น React Application
        ├── services/
        │   └── api.js                # ตัวกลางเรียก REST API, SSE Progress Stream, และอัปโหลดไฟล์
        ├── components/
        │   ├── Navbar.jsx            # แถบนำทางด้านบน พร้อมแสดงสถานะการเชื่อมต่อ Backend
        │   ├── DeviceForm.jsx        # ฟอร์มจัดการอุปกรณ์ (Single / Fleet / Import / Batch Setup)
        │   ├── TerminalOutput.jsx    # หน้าต่าง CLI Terminal แสดงผลพร้อมฟังก์ชัน Copy และ Masking
        │   └── AsyncJobModal.jsx     # หน้าต่างติดตามสถานะงาน Fleet 10,000+ แบบ SSE Stream
        └── pages/
            ├── HealthCheckPage.jsx   # หน้าตรวจสุขภาพอุปกรณ์ และรายงานผลสรุป Metrics
            ├── TroubleshootPage.jsx  # หน้า Interactive CLI, Ping/Traceroute, และ Log Filter
            ├── DeployConfigPage.jsx  # หน้าพุชคอนฟิก, Pre/Post Checks, Backup, และ Rollback
            └── TemplateStudioPage.jsx # หน้าออกแบบ เรนเดอร์ และ Deploy Jinja2 Templates
```

---

## 4. ตารางเปรียบเทียบคำสั่ง 7 แพลตฟอร์ม (Command Equivalents Matrix)

| หมวดหมู่คำสั่ง | Huawei VRP (Universal Pivot) | Cisco IOS / IOS-XE | Juniper JunOS | HPE Aruba | HP Comware | MikroTik RouterOS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **System Version** | `display version` | `show version` | `show version` | `show version` | `display version` | `/system resource print` |
| **Interface Status** | `display interface brief` | `show ip interface brief` | `show interfaces terse` | `show interface brief` | `display interface brief` | `/interface print brief` |
| **IP Addresses** | `display ip interface brief` | `show ip interface brief` | `show interfaces terse` | `show ip interface brief` | `display ip interface brief` | `/ip address print` |
| **Port Description** | `display interface description` | `show interfaces description` | `show interfaces descriptions` | `show interface custom` | `display interface description` | `/interface print` |
| **Active Config** | `display current-configuration` | `show running-config` | `show configuration` | `show running-config` | `display current-configuration` | `/export` |
| **Saved Config** | `display saved-configuration` | `show startup-config` | `show configuration` | `show config` | `display saved-configuration` | `/export file=backup` |
| **Routing Table** | `display ip routing-table` | `show ip route` | `show route` | `show ip route` | `display ip routing-table` | `/ip route print` |
| **ARP Table** | `display arp all` | `show ip arp` | `show arp` | `show arp` | `display arp all` | `/ip arp print` |
| **MAC Address Table** | `display mac-address` | `show mac address-table` | `show ethernet-switching table` | `show mac-address` | `display mac-address` | `/interface bridge host print` |
| **CPU Utilization** | `display cpu-usage` | `show processes cpu sorted` | `show chassis routing-engine` | `show cpu` | `display cpu-usage` | `/system resource print` |
| **Memory Usage** | `display memory-usage` | `show processes memory` | `show system storage` | `show system` | `display memory` | `/system resource print` |
| **Link Aggregation** | `display eth-trunk` | `show etherchannel summary` | `show lacp interfaces` | `show lacp` | `display link-aggregation verbose` | `/interface bonding print` |
| **VLAN Config** | `display vlan` | `show vlan brief` | `show vlans` | `show vlans` | `display vlan all` | `/interface vlan print` |
| **LLDP Neighbors** | `display lldp neighbor brief` | `show lldp neighbors` | `show lldp neighbors` | `show lldp info remote-device` | `display lldp neighbor list` | `/ip neighbor print` |
| **Optical / SFP** | `display transceiver diagnosis interface` | `show interfaces transceiver` | `show interfaces diagnostics optics` | `show interface transceiver` | `display transceiver diagnosis interface` | `/interface ethernet monitor [find] once` |
| **System Logs** | `display logbuffer` | `show logging` | `show log messages` | `show logging` | `display logbuffer` | `/log print` |

---

## 5. สคริปต์สุ่มสร้างข้อมูลอุปกรณ์จำลอง (Mock Device Generator)

โปรเจกต์มีสคริปต์ [generate_devices.py](generate_devices.py) ในตัวสำหรับสร้างไฟล์ CSV จำลองรายชื่ออุปกรณ์ขนาดใหญ่ เพื่อนำไปทดสอบประสิทธิภาพระบบ Fleet:

### จุดเด่นของสคริปต์:
1. **Realistic Naming**: สุ่มชื่อ Hostname ตามมาตรฐาน Enterprise: `{Role}-{Site}-{ID}` (เช่น `SW-Core-HQ-00142`, `RT-Edge-CNX-03819`, `FW-Perim-DC1-09124`)
2. **Valid Private IPv4**: สุ่ม IP ที่ถูกต้องตามมาตรฐาน RFC 1918 (Subnet `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`) โดยไม่สุ่มโดน Network ID (`.0`) และ Broadcast (`.255`)
3. **100% Unique Guarantee**: รับประกันว่าไม่มี Hostname หรือ IP ซ้ำกันแม้แต่รายการเดียว
4. **Header มาตรฐาน**: เขียนหัวคอลัมน์ `hostname,ip` พร้อมนำเข้าในหน้าระบบได้ทันที

### ตัวอย่างคำสั่งรัน:
```bash
# 1. สร้าง 1,000 อุปกรณ์ (บันทึกลง devices_1000.csv)
python3 generate_devices.py 1000 devices_1000.csv

# 2. สร้าง 10,000 อุปกรณ์ (บันทึกลง devices_10000.csv)
python3 generate_devices.py 10000 devices_10000.csv

# 3. กำหนดจำนวนเองตามต้องการ (เช่น 50,000 อุปกรณ์)
python3 generate_devices.py 50000 devices_50000.csv
```

---

## 6. รูปแบบไฟล์สำหรับนำเข้ารายชื่ออุปกรณ์ (Inventory Import Formats)

ระบบรองรับการนำเข้าไฟล์อุปกรณ์ 5 รูปแบบ โดยสามารถระบุทั้ง `hostname` และ `ip` หรือระบุเฉพาะ `ip` ได้อย่างยืดหยุ่น:

### 6.1 ไฟล์ CSV (`fleet.csv`)
```csv
hostname,ip
SW-Core-HQ-001,192.168.1.1
SW-Dist-BKK-002,192.168.1.2
RT-Edge-DC1-003,10.10.0.1
FW-Perim-DC2-004,172.16.50.1
```
*(รองรับทั้ง Comma `,`, Semicolon `;`, และ Tab `\t`)*

### 6.2 ไฟล์ Excel (`fleet.xlsx` หรือ `fleet.xls`)
จัดตารางโดยให้ Row 1 เป็นหัวคอลัมน์:
| hostname | ip |
| :--- | :--- |
| SW-Core-HQ-001 | 192.168.1.1 |
| SW-Dist-BKK-002 | 192.168.1.2 |
| RT-Edge-DC1-003 | 10.10.0.1 |

### 6.3 ไฟล์ JSON (`fleet.json`)
รองรับทั้งแบบ Array of Objects หรือ Array of Strings:
```json
[
  { "hostname": "SW-Core-HQ-001", "ip": "192.168.1.1" },
  { "hostname": "SW-Dist-BKK-002", "ip": "192.168.1.2" },
  { "hostname": "RT-Edge-DC1-003", "ip": "10.10.0.1" }
]
```
*หรือระบุเฉพาะ IP:*
```json
[
  "192.168.1.1",
  "192.168.1.2",
  "10.10.0.1"
]
```

### 6.4 ไฟล์ YAML (`fleet.yaml` หรือ `fleet.yml`)
```yaml
- hostname: SW-Core-HQ-001
  ip: 192.168.1.1
- hostname: SW-Dist-BKK-002
  ip: 192.168.1.2
- hostname: RT-Edge-DC1-003
  ip: 10.10.0.1
```

### 6.5 ไฟล์ Plain Text (`fleet.txt`)
ใส่ IP Address บรรทัดละ 1 เครื่อง:
```text
192.168.1.1
192.168.1.2
10.10.0.1
172.16.50.1
```

---

## 7. ไดรเวอร์อุปกรณ์เครือข่ายที่รองรับ (Supported Device Drivers)

| ยี่ห้อ / แบรนด์ | Driver Name (`device_type`) | โปรโตคอล | อุปกรณ์ตัวอย่างที่รองรับ |
| :--- | :--- | :--- | :--- |
| **Huawei (SSH)** | `huawei` | SSH (22) | CloudEngine Series, Quidway S-Series, NetEngine, AR Series, USG Firewall |
| **Huawei (Telnet)** | `huawei_telnet` | Telnet (23) | อุปกรณ์ Huawei รุ่นเก่าที่เปิดใช้ Telnet |
| **Cisco IOS / IOS-XE** | `cisco_ios` | SSH (22) | Catalyst 2960, 3650, 3850, 9200, 9300, 9500, ISR 4000, ASR 1000 |
| **Cisco IOS (Telnet)** | `cisco_ios_telnet` | Telnet (23) | Legacy Cisco Switch / Lab Devices |
| **Cisco NX-OS** | `cisco_nxos` | SSH (22) | Nexus 3000, 5000, 7000, 9000 Data Center Switches |
| **HP / H3C Comware** | `hp_comware` | SSH (22) | HPE FlexNetwork (5130, 5510, 5900, 7500, 10500), H3C Switches, 3Com |
| **Aruba / ProCurve** | `aruba_os` | SSH (22) | Aruba CX Series (6100, 6200, 6300, 8320), Aruba 2530, 2930, ProCurve |
| **Juniper JunOS** | `juniper_junos` | SSH (22) | EX Series (EX2300, EX3400, EX4300), QFX Series, SRX Firewalls |
| **MikroTik RouterOS** | `mikrotik_routeros` | SSH (22) | Cloud Router Switch (CRS Series), Cloud Core Router (CCR Series) |
| **Linux Server / NOS** | `linux` | SSH (22) | Ubuntu/Debian Linux Server, Cumulus Linux, SONiC Network OS |
| **Serial Console** | `serial` | Serial RS-232 | เชื่อมต่อผ่านสาย Console USB-to-Serial (`/dev/ttyUSB0` หรือ `COM3`) |

---

## 8. คู่มือการตั้งค่าอุปกรณ์เครือข่ายจริง (Network Equipment Setup Guide)

เพื่อให้ระบบสามารถเชื่อมต่อและรันคำสั่งโดยไม่ติด Pager (`--More--`) กรุณาเตรียมคำสั่งบนอุปกรณ์ดังนี้:

### 8.1 Cisco IOS / IOS-XE
```cisco
username admin privilege 15 secret SuperSecretPassword
ip ssh version 2
line vty 0 4
 transport input ssh
 login local
 exec-timeout 0 0
 length 0
```

### 8.2 Huawei VRP
```huawei
aaa
 local-user admin password irreversible-cipher SuperSecretPassword
 local-user admin service-type ssh terminal
 local-user admin level 15
#
stelnet server enable
ssh user admin authentication-type password
ssh user admin service-type stelnet
#
user-interface vty 0 4
 authentication-mode aaa
 protocol inbound ssh
 screen-length 0 temporary
```

### 8.3 Juniper JunOS
```junos
set system login user admin class super-user authentication plain-text-password
set system services ssh root-login allow
set system services ssh protocol-version v2
commit
```

---

## 9. การตั้งค่า Environment Variables (`.env`)

| ตัวแปร | ค่าเริ่มต้น | ชนิด | คำอธิบาย |
| :--- | :--- | :--- | :--- |
| `FRONTEND_PORT` | `4000` | Integer | พอร์ตสำหรับเรียกใช้งาน Web UI |
| `BACKEND_PORT` | `4050` | Integer | พอร์ตของ FastAPI Backend Server |
| `BACKEND_HOST` | `0.0.0.0` | String | Bind IP Address สำหรับ Backend |
| `VITE_API_BASE_URL` | `http://localhost:4050` | URL | URL ของ API ที่ Frontend จะเรียกใช้งาน |
| `DEFAULT_DEVICE_TYPE` | `huawei` | String | ค่าเริ่มต้นของ Vendor Driver |
| `DEFAULT_SSH_PORT` | `22` | Integer | พอร์ต SSH เริ่มต้น |
| `DEFAULT_TELNET_PORT` | `23` | Integer | พอร์ต Telnet เริ่มต้น |
| `DEFAULT_TIMEOUT` | `30` | Integer | Timeout การเชื่อมต่อ (วินาที) |
| `DEFAULT_NUM_WORKERS` | `10` | Integer | จำนวน Nornir Concurrent Workers เริ่มต้น |
| `GLOBAL_DELAY_FACTOR` | `1` | Integer | ตัวคูณการหน่วงเวลาการตอบสนองของ Netmiko |
| `ALLOWED_ORIGINS` | `http://localhost:4000,http://127.0.0.1:4000` | String | Origins ที่อนุญาตใน CORS Middleware |
| `SECRET_KEY` | `supersecret-key` | String | Security Secret Key สำหรับเข้ารหัส |
| `ENVIRONMENT` | `development` | String | สภาพแวดล้อม (`development` หรือ `production`) |

---

## 10. วิธีการติดตั้งและเริ่มต้นใช้งาน (Installation & Quick Start)

### วิธีที่ 1: รันด้วย Docker Compose (แนะนำสำหรับ Production)

```bash
# 1. โคลนและเตรียมไฟล์ .env
cp .env.example .env

# 2. เริ่มต้นระบบด้วย Docker Compose
docker compose up --build -d

# 3. ตรวจสอบสถานะ Service
docker compose ps

# 4. ดูบันทึกการทำงานแบบ Real-time
docker compose logs -f
```

- **Frontend Dashboard**: [http://localhost:4000](http://localhost:4000)
- **Backend Swagger UI Docs**: [http://localhost:4050/docs](http://localhost:4050/docs)
- **Backend ReDoc**: [http://localhost:4050/redoc](http://localhost:4050/redoc)

เมื่อต้องการปิดระบบ:
```bash
docker compose down
```

---

### วิธีที่ 2: รันแยก Service สำหรับ Local Development

#### 1. เริ่มการทำงานของ Backend (FastAPI)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # บน Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 4050 --reload
```

#### 2. เริ่มการทำงานของ Frontend (React + Vite)
เปิด Terminal หน้าต่างใหม่:
```bash
cd frontend
npm install
npm run dev
```

เปิดเบราว์เซอร์ไปที่ [http://localhost:4000](http://localhost:4000)

---

## 11. REST API Reference ฉบับสมบูรณ์

### 11.1 Devices & Inventory Endpoints (`/api/v1/devices`)
- **`POST /api/v1/devices/test-connection`**: ทดสอบการเชื่อมต่อ SSH/Telnet รายเครื่อง
- **`GET /api/v1/devices/drivers`**: ดึงรายการ Driver ทั้งหมดที่ระบบรองรับ
- **`POST /api/v1/devices/autodetect`**: ส่ง Probe ไปยังอุปกรณ์เพื่อตรวจจับยี่ห้อและ Model อัตโนมัติ
- **`POST /api/v1/devices/import`**: อัปโหลดไฟล์รายชื่ออุปกรณ์ (CSV, XLSX, JSON, YAML, TXT)
- **`GET /api/v1/devices/templates/{format}`**: ดาวน์โหลดไฟล์ Template ตัวอย่าง (`csv`, `xlsx`, `json`, `yaml`)

### 11.2 Fleet & Async Jobs Endpoints (`/api/v1/jobs`)
- **`GET /api/v1/jobs/{job_id}`**: ตรวจสอบสถานะสรุปของ Job
- **`GET /api/v1/jobs/{job_id}/stream`**: รับ Real-time Progress Stream ผ่าน Server-Sent Events (SSE)
- **`POST /api/v1/jobs/{job_id}/cancel`**: ส่งคำสั่งขอยกเลิก Job ที่กำลังรันอยู่
- **`GET /api/v1/jobs/{job_id}/export-zip`**: ดาวน์โหลด ZIP Archive บรรจุรายงานสรุป, รายงานรายเครื่อง, และ Log ดิบ

### 11.3 Operations Endpoints
- **`POST /api/v1/healthcheck/single`**: สั่งตรวจสุขภาพอุปกรณ์รายเครื่อง
- **`POST /api/v1/healthcheck/fleet`**: สั่งตรวจสุขภาพทั้ง Fleet (ส่งคืน Job ID)
- **`POST /api/v1/troubleshoot/run`**: ส่งคำสั่งรัน CLI แสดงผลแบบ Real-time
- **`POST /api/v1/troubleshoot/ping`**: รันคำสั่ง Ping ข้ามยี่ห้อ
- **`POST /api/v1/troubleshoot/traceroute`**: รันคำสั่ง Traceroute ข้ามยี่ห้อ
- **`POST /api/v1/troubleshoot/logfilter`**: ค้นหา Syslog ด้วย Keyword
- **`POST /api/v1/deploy/fleet`**: กระจายการตั้งค่าสู่ Fleet พร้อม Pre/Post Check และ Backup
- **`POST /api/v1/playbooks/auto-translate`**: แปลคำสั่งจาก Huawei VRP ไปยัง 6 ยี่ห้อที่เหลือ
- **`GET /api/v1/system/nornir-workers`**: ดึงจำนวน Concurrent Workers ที่กำลังทำงาน
- **`POST /api/v1/system/nornir-workers`**: ปรับเปลี่ยนจำนวน Workers (1 ถึง 100 Workers)

---

## 12. การปรับแต่งประสิทธิภาพระดับหมื่นเครื่อง (Performance & Kernel Tuning)

เมื่อต้องการบริหารจัดการอุปกรณ์มากกว่า 10,000 เครื่องพร้อมกัน ควรปรับค่า Linux Kernel บน Host Server:

```bash
# ปรับแต่งจำนวน File Descriptors และ Network Sockets ชั่วคราว
sudo sysctl -w fs.file-max=2097152
sudo sysctl -w net.core.somaxconn=65535
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=65535

# เพิ่ม Limit ใน /etc/security/limits.conf
# * soft nofile 65535
# * hard nofile 65535
```

### คำแนะนำการเลือกจำนวน Concurrent Workers:
- **10 - 20 Workers**: เหมาะสำหรับ Server ขนาดเล็ก (RAM 2-4 GB, 2 vCPU)
- **30 - 50 Workers**: เหมาะสำหรับ Server ระดับกลาง (RAM 8-16 GB, 4-8 vCPU) - *แนะนำสำหรับการใช้งานทั่วไป*
- **80 - 100 Workers**: เหมาะสำหรับ Enterprise Server (RAM 32+ GB, 16+ vCPU) บนเครือข่าย High-Bandwidth

---

## 13. มาตรฐานความปลอดภัย (Security & Enterprise Hardening)

1. **Regex Credential Masking**: ระบบตรวจจับข้อความรหัสผ่านในคำสั่ง เช่น `password`, `secret`, `pre-shared-key` และแทนที่ด้วย `******` ในหน้าจอ Terminal และไฟล์ Log อัตโนมัติ
2. **Sysname Verification**: ในกระบวนการ Deploy ระบบจะตรวจสอบ Prompt/Sysname จริงจากหน้างานเทียบกับ Hostname ที่ระบุ เพื่อป้องกันการส่งคอนฟิกผิดเครื่อง
3. **Automated Rollback & Backup**: สำรอง Running Config ทุกครั้งก่อนเปลี่ยนแปลง พร้อมเตรียม Rollback Script ให้ทันที
4. **Environment Secrets Protection**: ไฟล์ `.env` ถูกตั้งค่าใน `.gitignore` เพื่อไม่ให้ Credential รั่วไหลขึ้นระบบ Version Control

---

## 14. การแก้ไขปัญหาที่พบบ่อย (Troubleshooting & FAQ)

- **Q: ทำไมนำเข้าไฟล์ CSV แล้วแจ้งเตือนไม่พบ IP?**  
  **A:** ตรวจสอบว่าไฟล์ CSV มีหัวตารางชื่อ `ip` หรือ `hostname,ip` หากไม่มีหัวตาราง ระบบจะมองหาค่าที่ตรงกับรูปแบบ IP Address ในคอลัมน์แรกให้โดยอัตโนมัติ
- **Q: การเชื่อมต่อแจ้งเตือน Authentication Timeout?**  
  **A:** ตรวจสอบ Firewall / ACL ระหว่าง Server กับ Switch ว่าอนุญาตพอร์ต SSH (22) หรือ Telnet (23) หรือไม่ และลองเพิ่ม `DEFAULT_TIMEOUT=45` ในไฟล์ `.env`
- **Q: Output คำสั่งแสดงไม่ครบหรือค้างอยู่ที่ `--More--`?**  
  **A:** ระบบมีคำสั่งสั่งปิด Paging อัตโนมัติ (`screen-length 0 temporary` หรือ `terminal length 0`) หากอุปกรณ์ของท่านเป็นรุ่นพิเศษ ให้ตรวจสอบว่า user มีสิทธิ์รันคำสั่งดังกล่าวหรือไม่

---

## สิทธิ์การใช้งานและการสนับสนุน (License & Support)
ระบบนี้พัฒนาขึ้นเพื่อเพิ่มประสิทธิภาพและความแม่นยำในการทำงานของทีมปฏิบัติการเครือข่าย (Network Engineers / NOC / NetOps) หากต้องการสอบถามข้อมูลเพิ่มเติมหรือแจ้งปัญหา สามารถเปิด Issue หรือติดต่อทีมผู้ดูแลได้ทันที
