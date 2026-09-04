# Network Automation & Diagnostic Web Platform

เว็บแอปพลิเคชันสำหรับบริหารจัดการ, ตรวจสอบสุขภาพ (Health Check), แก้ไขปัญหา (Troubleshoot) และปรับแต่งคอนฟิก (Deploy Configuration) บนอุปกรณ์เครือข่ายระดับองค์กร (Switch / Router) ทั้งแบบรายเครื่อง (Single Device) และแบบกลุ่มขนาดใหญ่ระดับหลักหมื่นเครื่อง (Multi-Device Fleet Scalability) รองรับระบบหลายผู้ผลิต (Multi-Vendor) ผ่านระบบ Web UI

---

## ฟังก์ชันเด่นของระบบ (Key Features)

### 1. เครื่องยนต์แปลคำสั่งเครือข่ายหลายผู้ผลิต (Multi-Vendor Command Translation Engine)
- **Huawei VRP เป็น Syntax หลัก (Primary Syntax & Universal Pivot)**:
  - ผู้ใช้งานสามารถกรอกคำสั่งในรูปแบบ Huawei VRP (`display ...`) เพียงชุดเดียว ระบบจะแปลงเป็นคำสั่งเฉพาะของแต่ละยี่ห้อให้โดยอัตโนมัติ
- **รองรับ 7 แพลตฟอร์มอุปกรณ์เครือข่ายชั้นนำ**:
  1. **Huawei VRP**: `display version`, `display current-configuration`, `display interface brief`
  2. **Cisco IOS / IOS-XE**: `show version`, `show running-config`, `show ip interface brief`
  3. **Cisco NX-OS**: `show version`, `show running-config`, `show interface status`
  4. **Juniper JunOS**: `show version`, `show configuration`, `show interfaces terse`
  5. **HPE Aruba (ArubaOS-CX / ProCurve)**: `show version`, `show running-config`, `show interface brief`
  6. **HP / H3C Comware**: `display version`, `display current-configuration`, `display interface Bridge-Aggregation`
  7. **MikroTik RouterOS**: `/system resource print`, `/export`, `/interface print brief`
- **ระบบแปลงคำสั่งอัจฉริยะ (Heuristic & Parameterized Translation)**:
  - ตรวจจับและแปลงชื่อพอร์ตและการรวมลิงก์อัตโนมัติ: `Eth-Trunk` (Huawei) <-> `Port-channel` (Cisco) <-> `ae` (Juniper) <-> `Bridge-Aggregation` (Comware) <-> `bonding` (MikroTik)
  - แปลงคำสั่งค้นหา Routing Table และ ARP ที่ระบุ IP ปลายทาง เช่น `display ip routing-table 10.1.1.0` -> `show ip route 10.1.1.0`
  - แปลงเครื่องมือทดสอบการเชื่อมต่อ: `ping` และ `tracert` / `traceroute`
- **รองรับตัวย่อ CLI (Shorthand CLI Normalization)**:
  - รองรับคำสั่งย่อที่คุ้นเคย เช่น `dis ver`, `disp int brief`, `sh ip int br`, `dis cur`, `disp cur`, `sh run` ระบบจะแปลงเป็นคำสั่งเต็มให้ก่อนประมวลผล

### 2. ระบบจัดการโปรไฟล์ชุดคำสั่งแบบไดนามิก (Dynamic Command Profiles / Playbooks)
- สร้างและจัดเก็บชุดคำสั่งวิเคราะห์ปัญหาและตรวจสุขภาพ (Profiles/Playbooks) ที่ทำงานได้กับทุกยี่ห้อ
- **กล่องคำสั่งแยกตามผู้ผลิต (Vendor Custom Command Boxes)**:
  - หน้าต่าง Modal เริ่มต้นอย่างเรียบง่ายด้วยช่องกรอก Huawei (Primary)
  - มีปุ่มเพิ่มกล่องคำสั่งเฉพาะยี่ห้อ: **Cisco**, **Juniper**, **Aruba**, **MikroTik**
  - ปุ่ม **"เปิดทุกยี่ห้อ (Auto-Fill All)"**: เปิดกล่องคำสั่งทุกยี่ห้อพร้อมแปลงคำสั่งจาก Huawei ให้อัตโนมัติใน 1 คลิก
  - ปุ่ม **"ปิดทุกยี่ห้อ (Close All)"**: ปิดกล่องคำสั่งของยี่ห้ออื่นทั้งหมด คืนความคลีนให้หน้าจอ โดยระบบยังคงแปลงคำสั่งให้ในเบื้องหลัง
  - ปุ่ม **"Auto-fill [Vendor]"**: แปลงและใส่คำสั่งเฉพาะยี่ห้อที่เลือกจากกล่อง Huawei
- รองรับการ Import/Export โปรไฟล์และบันทึกข้อมูลลงฐานข้อมูล JSON ถาวร

### 3. โหมดการทำงานคู่ (Single Device & Multi-Device Fleet)
- **Single Device Mode**:
  - ทดสอบเชื่อมต่อ SSH/Telnet/Serial รายเครื่อง
  - รันคำสั่งโต้ตอบแบบ Real-time พร้อมแสดงผล Terminal Output
  - **Cross-Vendor Resolution**: แม้จะพิมพ์คำสั่ง Huawei (`display ...`) ส่งไปยังอุปกรณ์ Cisco หรือ Juniper ระบบจะแปลงเป็นคำสั่งของยี่ห้อนั้นๆ ก่อนยิงจริง หมดปัญหาคำสั่ง Syntax Error
- **Multi-Device Fleet Mode (10,000+ Scale)**:
  - จัดการรายชื่ออุปกรณ์ได้ไม่จำกัดจำนวน
  - แถบ **Batch Setup**: กำหนด Vendor, Username และ Password ให้กับอุปกรณ์ทุกเครื่องในคลิกเดียว
  - ประมวลผลแบบขนาน (Concurrent Workers) ผ่านระบบ Background Async Job & Nornir Engine คล่องตัว ไม่ค้างหน้าจอ
  - ระบบ **Real-time SSE Stream**: ติดตามสถานะ ความคืบหน้า (Progress Bar) และดู Log ผลลัพธ์แยกตามอุปกรณ์ได้สดๆ
  - ตารางแสดงผลลัพธ์รองรับการค้นหา (Filter), จัดหน้า (Pagination), และเลื่อนดูข้อมูลในแนวนอน (Horizontal Scroll)

### 4. นำเข้ารายชื่อ IP อัตโนมัติ (IP List Import)
- นำเข้ารายชื่อ IP Address คราวละมากๆ โดยไม่ต้องพิมพ์ทีละตัว รองรับ 5 รูปแบบไฟล์ยอดนิยม:
  - **CSV (`.csv`)**: คอลัมน์ `ip`
  - **Excel (`.xlsx`, `.xls`)**: ตาราง Excel คอลัมน์ `ip`
  - **JSON (`.json`)**: Array ของ IP Address
  - **YAML (`.yaml`, `.yml`)**: List ของ IP Address
  - **Text (`.txt`)**: รายชื่อ IP บรรทัดละ 1 เครื่อง
- มีปุ่มดาวน์โหลดตัวอย่างไฟล์ Template (`.csv`, `.xlsx`, `.json`, `.yaml`) ในหน้าต่าง Import
- เลือกระหว่าง **Replace Current Fleet** (แทนที่ทั้งหมด) หรือ **Append to Existing Fleet** (เพิ่มต่อท้าย)
- ดึงค่า Vendor, Username และ Password จาก Batch Setup ไปใส่ให้อุปกรณ์ที่ Import เข้ามาโดยอัตโนมัติ

### 5. โมดูลการทำงานหลัก 4 ส่วน
1. **Health Check**:
   - ชุดตรวจสุขภาพมาตรฐาน 6 หมวดหมู่ (Standard, Interfaces, Transceiver/Optics, Environment, Routing, Logs)
   - สรุปตัวชี้วัดประสิทธิภาพ (CPU % และ Memory %) อัตโนมัติสำหรับ Huawei, Cisco, Juniper, Aruba, MikroTik
   - รองรับการรันแบบ Single Device และกระจายรันพร้อมกันทั้ง Fleet
2. **Troubleshoot & Interactive CLI**:
   - รันคำสั่งโต้ตอบ แสดงผลลัพธ์ผ่าน CLI Terminal ทันที
   - เครื่องมือ Ping Test และ Traceroute แปลง Syntax ตามยี่ห้ออุปกรณ์อัตโนมัติ
   - ค้นหา Syslog ผ่านคีย์เวิร์ด (Log Filter)
   - รัน Saved Command Profiles วิเคราะห์ปัญหาหน้างาน
3. **Deploy Configuration**:
   - พุชคอนฟิกขึ้นอุปกรณ์เครือข่าย พร้อมระบบตรวจสอบความปลอดภัย
   - รัน Pre-check และ Post-check commands อัตโนมัติตามยี่ห้ออุปกรณ์
   - ดึง Backup Running Config อัตโนมัติก่อนเริ่ม Deploy
   - สร้าง Rollback Commands ย้อนกลับคอนฟิกอัตโนมัติ
   - บันทึกคอนฟิกลง Startup/NVRAM (`save` / `write memory` / `commit`) อัตโนมัติเมื่อสำเร็จ
4. **Template Studio**:
   - ออกแบบและทดสอบเรนเดอร์การตั้งค่าผ่าน Jinja2 Configuration Templates
   - รองรับตัวแปร YAML/JSON พร้อมพุชคอนฟิกที่เรนเดอร์แล้วไปยังอุปกรณ์โดยตรง

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
deploy-config/
├── .env                              # ไฟล์คอนฟิกระบบ (Frontend 4000, Backend 4050)
├── .env.example                      # ตัวอย่างไฟล์คอนฟิกสำหรับ Clone โปรเจกต์
├── .gitignore                        # ป้องกันการ Push ข้อมูล Credential และไฟล์ชั่วคราว
├── docker-compose.yml                # Docker Compose Orchestration (ดึงค่าจาก .env)
├── NETWORK_SETUP_GUIDE.md            # คู่มือการติดตั้งและเตรียมเครือข่ายสำหรับอุปกรณ์จริง
├── README.md                         # คู่มือและเอกสารการใช้งานระบบ
│
├── backend/                          # Python FastAPI Backend
│   ├── Dockerfile                    # Container configuration สำหรับ Backend (Python 3.11-slim)
│   ├── requirements.txt              # รายการแพ็กเกจ (FastAPI, Netmiko, Nornir, openpyxl, pyyaml, pydantic)
│   ├── test_fleet_simulation.py      # สคริปต์จำลองทดสอบ Fleet 10,000+ เครื่อง
│   └── app/
│       ├── main.py                   # FastAPI Application Entrypoint และ CORS Middleware
│       ├── test_autodetect_simulation.py # สคริปต์ทดสอบจำลอง Auto-detect Device Type
│       ├── core/
│       │   └── config.py             # ตั้งค่าระบบและโหลด Environment Variables จาก .env
│       ├── data/                     # ที่เก็บข้อมูลถาวร (Persistent JSON Storage)
│       │   ├── playbooks.json        # ฐานข้อมูล JSON สำหรับบันทึก Command Profiles / Playbooks
│       │   └── templates.json        # ฐานข้อมูล JSON สำหรับเก็บ Jinja2 Configuration Templates
│       ├── schemas/                  # Pydantic Data Models & Validation Schemas
│       │   ├── command.py            # สกีมาสำหรับ Single/Batch Command, Health Check, และ Advanced Deploy
│       │   ├── device.py             # สกีมาสำหรับ Device Credentials, Connection Test, และ Fleet List
│       │   ├── playbook.py           # สกีมาสำหรับ Multi-Vendor Command Profiles และ Auto-Translate API
│       │   └── template.py           # สกีมาสำหรับ Jinja2 Configuration Templates
│       ├── services/                 # Core Automation Engines & Network Drivers
│       │   ├── autodetect_service.py # เครื่องยนต์วิเคราะห์และตรวจจับประเภทอุปกรณ์ (Device Type) อัตโนมัติ
│       │   ├── command_translator.py # เครื่องยนต์แปลงคำสั่ง 7 แพลตฟอร์มเครือข่าย (Universal Pivot)
│       │   ├── inventory_parser.py   # เครื่องมือถอดรหัสไฟล์ CSV, XLSX, JSON, YAML สำหรับ Import IP
│       │   ├── job_service.py        # จัดการคิวงาน Background Async Job, Chunking, และ SSE Progress Stream
│       │   ├── netmiko_service.py    # ไดรเวอร์ SSH/Telnet/Serial และ Credential Masking ผ่าน Netmiko
│       │   ├── nornir_service.py     # Multithreading Concurrent Engine รันงาน Fleet ระดับหมื่นเครื่อง
│       │   ├── parser_service.py     # ตัวแยกวิเคราะห์ Regex สรุปข้อมูล Version, CPU, Memory, และ Port Status
│       │   ├── playbook_service.py   # จัดการ CRUD บันทึก/แก้ไข/ลบโปรไฟล์คำสั่ง Multi-Vendor
│       │   └── template_service.py   # จัดการเรนเดอร์และบันทึก Jinja2 Configuration Templates
│       └── api/
│           └── endpoints/            # REST API Router Endpoints
│               ├── deploy.py         # API พุชคอนฟิก, Pre/Post Check, Backup, และ Rollback
│               ├── devices.py        # API ทดสอบเชื่อมต่อ, ดึง Driver, Auto-detect, นำเข้า IP, ดาวน์โหลด Template
│               ├── healthcheck.py    # API ตรวจสุขภาพอุปกรณ์ทั้ง Single Device และ Fleet
│               ├── jobs.py           # API ติดตามสถานะงานและ SSE Stream สำหรับ Fleet ระดับหมื่นเครื่อง
│               ├── playbooks.py      # API CRUD Command Profiles และ Auto-Translate คำสั่ง
│               ├── templates.py      # API ออกแบบและเรนเดอร์ Jinja2 Configuration Templates
│               └── troubleshoot.py   # API Interactive CLI, Ping, Traceroute, และ Log Filter
│
└── frontend/                         # React (Vite + TailwindCSS) Frontend
    ├── Dockerfile                    # Multi-stage production build (Nginx)
    ├── Dockerfile.dev                # Development container สำหรับ Live Reload
    ├── nginx.conf                    # Nginx Reverse Proxy & Static File Server config
    ├── package.json                  # รายการ Dependencies (React 18, Vite, TailwindCSS, Lucide Icons, Axios)
    ├── package-lock.json             # บันทึกเวอร์ชันที่แน่นอนของแพ็กเกจ
    ├── vite.config.js                # การตั้งค่า Vite Dev Server (Port 4000) และ Proxy
    ├── tailwind.config.js            # การตั้งค่า TailwindCSS
    ├── postcss.config.js             # การตั้งค่า PostCSS
    ├── index.html                    # HTML Single Page Entrypoint
    └── src/
        ├── App.jsx & App.css         # คอมโพเนนต์หน้าเว็บหลัก แถบสลับแท็บเมนู และระบบจัดการ Global State
        ├── main.jsx & index.css      # จุดเริ่มต้น React Application และสไตล์กลาง (Enterprise Dark Theme)
        ├── services/
        │   └── api.js                # ฟังก์ชันเชื่อมต่อ REST API, SSE Progress Stream, และ File Upload
        ├── components/               # คอมโพเนนต์ UI ส่วนกลางที่ใช้ซ้ำ
        │   ├── Navbar.jsx & .css     # แถบนำทางด้านบนและไฟสถานะการเชื่อมต่อ Backend
        │   ├── DeviceForm.jsx & .css # ฟอร์ม Target Device, Fleet List Table, Batch Setup, และ Modal Import IP
        │   ├── TerminalOutput.jsx & .css # หน้าต่าง CLI Console พร้อมระบบ Masking รหัสผ่าน และปุ่ม Copy
        │   └── AsyncJobModal.jsx & .css  # หน้าต่างติดตามสถานะงาน Fleet 10,000+ แบบ Real-time SSE Stream
        └── pages/                    # หน้าจอหลักตามแต่ละโมดูลการทำงาน
            ├── HealthCheckPage.jsx & .css    # หน้าตรวจสุขภาพอุปกรณ์, Metrics Summary, และ Command Profiles
            ├── TroubleshootPage.jsx & .css   # หน้า Interactive CLI, Ping/Traceroute, Log Filter, และ Profile Runner
            ├── DeployConfigPage.jsx & .css   # หน้าพุชคอนฟิก, Pre/Post Checks, Backup, และ Rollback Generation
            └── TemplateStudioPage.jsx & .css # หน้าออกแบบ ทดสอบเรนเดอร์ และ Deploy Jinja2 Config Templates
```

---

## ตารางเปรียบเทียบคำสั่ง 7 แพลตฟอร์ม (Command Equivalents Matrix)

| หมวดหมู่การตรวจสอบ | Huawei VRP (Primary) | Cisco IOS / IOS-XE | Juniper JunOS | HPE Aruba | HP Comware | MikroTik RouterOS |
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

## การตั้งค่า Environment Variables (`.env`)

ระบบถูกออกแบบให้ดึงค่าการทำงานทั้งหมดผ่านไฟล์ `.env` ที่ Root Directory:

```env
# พอร์ตการทำงาน
FRONTEND_PORT=4000
BACKEND_PORT=4050

# การตั้งค่า Backend API
BACKEND_HOST=0.0.0.0
VITE_API_BASE_URL=http://localhost:4050

# ค่าเริ่มต้นสำหรับอุปกรณ์เครือข่าย
DEFAULT_DEVICE_TYPE=huawei
DEFAULT_SSH_PORT=22
DEFAULT_TIMEOUT=30
GLOBAL_DELAY_FACTOR=1

# ความปลอดภัยและ CORS
SECRET_KEY=supersecret-network-automation-key-change-me
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:4000,http://127.0.0.1:4000
```

---

## วิธีการเริ่มต้นใช้งาน (Getting Started)

### วิธีที่ 1: รันด้วย Docker Compose (แนะนำสำหรับ Production / ใช้งานจริง)

สั่ง build และเริ่มต้นการทำงานของ Container ทั้งหมดในเบื้องหลัง:

```bash
docker compose up --build -d
```

- **Frontend Web UI**: [http://localhost:4000](http://localhost:4000)
- **Backend API Docs (Swagger UI)**: [http://localhost:4050/docs](http://localhost:4050/docs)
- **Backend ReDoc**: [http://localhost:4050/redoc](http://localhost:4050/redoc)

ตรวจสอบสถานะการทำงาน:
```bash
docker compose ps
```

ดู Log การทำงาน:
```bash
docker compose logs -f
```

หยุดการทำงาน:
```bash
docker compose down
```

---

### วิธีที่ 2: รันแบบแยกเครื่องสำหรับ Local Development

#### 1. เริ่มการทำงานของ Backend (Python FastAPI)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # บน Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 4050 --reload
```

#### 2. เริ่มการทำงานของ Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

เปิดเบราว์เซอร์ไปที่ [http://localhost:4000](http://localhost:4000)

---

## รูปแบบไฟล์สำหรับ Import IP (Import Formats)

ในการนำเข้ารายชื่อ IP เข้าสู่ Multi-Device Fleet คุณสามารถสร้างไฟล์ที่มีเฉพาะ IP ได้ดังนี้:

### 1. ไฟล์ CSV (`fleet.csv`)
```csv
ip
192.168.1.1
192.168.1.2
10.0.0.1
10.0.0.2
```

### 2. ไฟล์ Excel (`fleet.xlsx`)
สร้างตารางโดยให้แถวแรก (Header) เป็น `ip` แล้วใส่รายชื่อ IP ในแถวถัดไป

### 3. ไฟล์ Text (`fleet.txt`)
```text
192.168.1.1
192.168.1.2
10.0.0.1
10.0.0.2
```

### 4. ไฟล์ JSON (`fleet.json`)
```json
[
  "192.168.1.1",
  "192.168.1.2",
  "10.0.0.1",
  "10.0.0.2"
]
```

### 5. ไฟล์ YAML (`fleet.yaml`)
```yaml
- 192.168.1.1
- 192.168.1.2
- 10.0.0.1
- 10.0.0.2
```

*หมายเหตุ: เมื่อ Import เข้าสู่ระบบ ระบบจะนำค่า Vendor, Username และ Password จากแถบ Batch Setup ไปกำหนดให้อัตโนมัติ*

---

## ผู้ผลิตและไดรเวอร์อุปกรณ์เครือข่ายที่รองรับ (Supported Drivers)

ระบบขับเคลื่อนด้วย Netmiko และ Nornir รองรับคำสั่งของอุปกรณ์เครือข่ายหลากหลายแบรนด์:

| แบรนด์ / ผู้ผลิต | Driver Name (`device_type`) | ตัวอย่างอุปกรณ์ที่รองรับ |
| :--- | :--- | :--- |
| **Huawei (SSH)** | `huawei` | CloudEngine, Quidway S-Series, NetEngine, AR Series |
| **Huawei (Telnet)** | `huawei_telnet` | อุปกรณ์ Huawei รุ่นเก่าที่เปิดใช้เฉพาะ Telnet |
| **Cisco IOS / IOS-XE** | `cisco_ios` | Catalyst 2960/3850/9200/9300, ISR 4000, ASR 1000 |
| **Cisco IOS (Telnet)** | `cisco_ios_telnet` | Lab Switch / Legacy Cisco Switch |
| **Cisco NX-OS** | `cisco_nxos` | Nexus 3000, 5000, 7000, 9000 Series |
| **HP / H3C Comware** | `hp_comware` | HPE FlexNetwork, H3C Switch, 3Com |
| **Aruba / ProCurve** | `aruba_os` | Aruba CX Series, ProCurve Switch |
| **Juniper JunOS** | `juniper_junos` | EX Series, QFX Series, SRX Gateway |
| **MikroTik RouterOS** | `mikrotik_routeros` | Cloud Router Switch (CRS), Cloud Core (CCR) |
| **Linux / Server** | `linux` | Linux Server, Cumulus Linux Network OS |
| **Console Port** | `serial` | เชื่อมต่อผ่านสาย USB-to-Serial Console (`/dev/ttyUSB0`) |

---

## ตัวอย่าง REST API สำหรับการแปลคำสั่งอัตโนมัติ (Auto-Translate API)

### Endpoint: `POST /api/v1/playbooks/auto-translate`

#### Request Payload:
```json
{
  "commands": [
    "display version",
    "display interface brief",
    "display ip routing-table 10.0.0.0",
    "display current-configuration"
  ],
  "source_vendor": "huawei"
}
```

#### Response:
```json
{
  "source_vendor": "huawei",
  "commands": [
    "display version",
    "display interface brief",
    "display ip routing-table 10.0.0.0",
    "display current-configuration"
  ],
  "translations": {
    "huawei": [
      "display version",
      "display interface brief",
      "display ip routing-table 10.0.0.0",
      "display current-configuration"
    ],
    "cisco_ios": [
      "show version",
      "show ip interface brief",
      "show ip route 10.0.0.0",
      "show running-config"
    ],
    "juniper_junos": [
      "show version",
      "show interfaces terse",
      "show route 10.0.0.0",
      "show configuration"
    ],
    "cisco_nxos": [
      "show version",
      "show interface status",
      "show ip route 10.0.0.0",
      "show running-config"
    ],
    "aruba_os": [
      "show version",
      "show interface brief",
      "show ip route 10.0.0.0",
      "show running-config"
    ],
    "hp_comware": [
      "display version",
      "display interface brief",
      "display ip routing-table 10.0.0.0",
      "display current-configuration"
    ],
    "mikrotik_routeros": [
      "/system resource print",
      "/interface print brief",
      "/ip route print",
      "/export"
    ]
  }
}
```

---

## ข้อควรระวังและการดูแลรักษาความปลอดภัย (Security & Best Practices)

1. **การปกปิดรหัสผ่านใน Log (Credential Masking)**: ระบบหน้าจอ Terminal Output มีฟังก์ชัน Masking คำสั่งคอนฟิกที่มีรหัสผ่าน เช่น `password`, `secret`, `pre-shared-key` ไม่ให้แสดงข้อความจริงบนหน้าจอ
2. **การจัดเก็บไฟล์ `.env`**: ไฟล์ `.env` ที่บรรจุรหัสผ่านและค่าคอนฟิกลับถูกระบุไว้ใน `.gitignore` เรียบร้อยแล้ว เพื่อป้องกันไม่ให้ถูกอัปโหลดขึ้น Git Repository
3. **การเข้าถึงอุปกรณ์จริง**: ตรวจสอบการอนุญาตสิทธิ์บน Firewall หรือ Access Control List (ACL) ของอุปกรณ์เครือข่าย ให้เปิดพอร์ต SSH (22) หรือ Telnet (23) จาก IP ของ Host Server ที่รันระบบนี้
