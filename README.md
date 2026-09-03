# Network Automation & Diagnostic Web Platform

เว็บแอปพลิเคชันสำหรับบริหารจัดการ, ตรวจสอบสุขภาพ (Health Check), แก้ไขปัญหา (Troubleshoot) และปรับแต่งคอนฟิก (Deploy Configuration) บนอุปกรณ์เครือข่ายระดับองค์กร (Switch / Router) ทั้งแบบรายเครื่อง (Single Device) และแบบกลุ่มขนาดใหญ่ระดับหลักหมื่นเครื่อง (Multi-Device Fleet Scalability) ผ่านระบบ Web UI

---

## ฟังก์ชันเด่นของระบบ (Key Features)

### 1. โหมดการทำงานคู่ (Single Device & Multi-Device Fleet)
- **Single Device Mode**: ทดสอบการเชื่อมต่อ SSH/Telnet รายเครื่อง และรันคำสั่งโต้ตอบแบบ Real-time พร้อมแสดงผลลัพธ์ผ่าน Terminal Output ทันที
- **Multi-Device Fleet Mode (10,000+ Scale)**:
  - จัดการรายชื่ออุปกรณ์ได้ไม่จำกัดจำนวน
  - แถบ **Batch Setup**: กำหนด Vendor, Username และ Password ให้กับอุปกรณ์ทุกเครื่องในคลิกเดียว
  - ประมวลผลแบบขนาน (Concurrent Workers) ด้วยระบบ Background Async Job คล่องตัว ไม่ค้างหน้าจอ
  - ระบบ **Real-time SSE Stream**: ติดตามสถานะ ความคืบหน้า (Progress Bar) และดู Log ผลลัพธ์แยกตามอุปกรณ์ได้แบบสดๆ
  - ตารางแสดงผลลัพธ์รองรับการค้นหา (Filter), จัดหน้า (Pagination), และเลื่อนดูข้อมูลในแนวนอน (Horizontal Scroll)

### 2. นำเข้ารายชื่อ IP อัตโนมัติ (IP List Import)
- นำเข้ารายชื่อ IP Address คราวละมากๆ โดยไม่ต้องพิมพ์ทีละตัว รองรับ 4 รูปแบบไฟล์ยอดนิยม:
  - **CSV (`.csv`)**: คอลัมน์ `ip`
  - **Excel (`.xlsx`, `.xls`)**: ตาราง Excel คอลัมน์ `ip`
  - **JSON (`.json`)**: Array ของ IP Address
  - **YAML (`.yaml`, `.yml`)**: List ของ IP Address
  - **Text (`.txt`)**: รายชื่อ IP บรรทัดละ 1 เครื่อง
- มีปุ่มดาวน์โหลดตัวอย่างไฟล์ Template (`.csv`, `.xlsx`, `.json`, `.yaml`) ในหน้าต่าง Import
- เลือกระหว่าง **Replace Current Fleet** (แทนที่ทั้งหมด) หรือ **Append to Existing Fleet** (เพิ่มต่อท้าย)
- ดึงค่า Vendor, Username และ Password จาก Batch Setup ไปใส่ให้อุปกรณ์ที่ Import เข้ามาโดยอัตโนมัติ

### 3. ระบบโปรไฟล์ชุดคำสั่งแยกตามผู้ผลิต (Manufacturer-Separated Command Profiles)
- บันทึกและจัดการชุดคำสั่งตรวจสุขภาพหรือวิเคราะห์ปัญหา (CRUD Profiles/Playbooks)
- แยกช่องกรอกคำสั่งชัดเจนระหว่างผู้ผลิต:
  - **Cisco IOS / IOS-XE**: ใช้คำสั่งแบบเต็ม เช่น `show ip interface brief`, `show version`, `show running-config`
  - **Huawei VRP**: ใช้คำสั่งแบบเต็ม เช่น `display ip interface brief`, `display version`, `display current-configuration`
- รองรับการรันชุดคำสั่งทั้งแบบ Single Device และกระจายรันพร้อมกันทั้ง Fleet
- จัดเก็บข้อมูลโปรไฟล์ในรูปแบบ JSON พร้อมบันทึกลงดิสก์ถาวร

### 4. โมดูลการทำงานหลัก 3 ส่วน
1. **Health Check**:
   - รันชุดตรวจสุขภาพแบบเลือกหมวดหมู่ (Interface, Hardware, CPU/Memory, Routing, Log)
   - รันโปรไฟล์ตรวจสอบเฉพาะทางแบบ One-Click
2. **Troubleshoot & Interactive CLI**:
   - รันคำสั่งโต้ตอบ แสดงผลลัพธ์ผ่าน CLI Terminal ทันที
   - เครื่องมือ Ping Test ตรวจสอบ Latency และ Packet Loss
   - โปรไฟล์คำสั่ง Saved Profiles สำหรับการวิเคราะห์ปัญหาหน้างาน
3. **Deploy Configuration**:
   - พุชคอนฟิกขึ้นอุปกรณ์เครือข่าย พร้อมระบบตรวจสอบความปลอดภัย (Dry Run)
   - สั่ง Save Running-Config (`write memory` / `save`) อัตโนมัติเมื่อคอนฟิกสำเร็จ

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
deploy-config/
├── .env                              # ไฟล์คอนฟิกระบบ (Frontend 4000, Backend 4050)
├── .env.example                      # ตัวอย่างไฟล์คอนฟิกสำหรับ Clone โปรเจกต์
├── .gitignore                        # ป้องกันการ Push ข้อมูล Credential และไฟล์ชั่วคราว
├── docker-compose.yml                # Docker Compose Orchestration (ดึงค่าจาก .env)
├── README.md                         # คู่มือและเอกสารการใช้งานระบบ
│
├── backend/                          # Python FastAPI Backend
│   ├── Dockerfile                    # Container configuration สำหรับ Backend
│   ├── requirements.txt              # รายการแพ็กเกจ (FastAPI, Netmiko, Nornir, openpyxl, pyyaml)
│   └── app/
│       ├── main.py                   # FastAPI Application Entrypoint และ CORS
│       ├── core/
│       │   └── config.py             # ตั้งค่าระบบและอ่าน Environment Variables
│       ├── data/                     # ที่เก็บข้อมูลถาวร (Persistent JSON Storage)
│       │   ├── playbooks.json        # ฐานข้อมูล JSON สำหรับบันทึก Command Profiles
│       │   └── templates.json        # ฐานข้อมูล JSON สำหรับเก็บ Jinja2 Config Templates
│       ├── schemas/                  # Pydantic Validation Schemas
│       │   ├── command.py            # ชุดคำสั่งตรวจสุขภาพและผลลัพธ์การรัน
│       │   ├── device.py             # ข้อมูล Credentials อุปกรณ์และผลการทดสอบการเชื่อมต่อ
│       │   ├── playbook.py           # โครงสร้าง Command Profile ตามผู้ผลิต (Cisco / Huawei)
│       │   └── template.py           # โครงสร้าง Jinja2 Configuration Templates
│       ├── services/                 # Business Logic & Network Automation Drivers
│       │   ├── inventory_parser.py   # ถอดรหัสไฟล์ CSV, XLSX, JSON, YAML สำหรับ Import IP
│       │   ├── job_service.py        # จัดการคิวงาน Background Async Job & SSE Stream
│       │   ├── netmiko_service.py    # ไดรเวอร์ SSH/Telnet/Serial ผ่าน Netmiko
│       │   ├── nornir_service.py     # ระบบ Multithreading Engine รันงาน Fleet ขนานกัน
│       │   ├── parser_service.py     # ตัวแยกวิเคราะห์โครงสร้างผลลัพธ์ CLI
│       │   ├── playbook_service.py   # จัดการ CRUD บันทึก/แก้ไขโปรไฟล์ชุดคำสั่ง
│       │   └── template_service.py   # จัดการเรนเดอร์และบันทึก Jinja2 Config Templates
│       └── api/
│           └── endpoints/
│               ├── deploy.py         # พุชคอนฟิกขึ้นอุปกรณ์
│               ├── devices.py        # ทดสอบเชื่อมต่อ, ดึง Driver, นำเข้า IP, ดาวน์โหลด Template
│               ├── healthcheck.py    # ตรวจสุขภาพอุปกรณ์ทั้ง Single Device และ Fleet
│               ├── jobs.py           # ติดตามสถานะงานและ SSE Stream สำหรับ Fleet ระดับหมื่นเครื่อง
│               ├── playbooks.py      # CRUD จัดการ Command Profiles (บันทึก/แก้ไข/ลบ)
│               ├── templates.py      # API สำหรับ Jinja2 Configuration Template Studio
│               └── troubleshoot.py   # CLI โต้ตอบและ Ping Test
│
└── frontend/                         # React (Vite + TailwindCSS) Frontend
    ├── Dockerfile                    # Multi-stage production build (Nginx)
    ├── Dockerfile.dev                # Development container สำหรับ Live Reload
    ├── nginx.conf                    # Nginx Reverse Proxy & HTTP Server config
    ├── package.json                  # รายการ Dependencies (React 18, Tailwind, Lucide Icons)
    ├── vite.config.js                # การตั้งค่า Vite Dev Server (Port 4000)
    ├── tailwind.config.js            # การตั้งค่า TailwindCSS
    ├── postcss.config.js             # การตั้งค่า PostCSS
    ├── index.html                    # HTML Template
    └── src/
        ├── App.jsx & App.css         # โครงสร้างหน้าเว็บหลักและแถบสลับแท็บเมนู
        ├── main.jsx & index.css      # จุดเริ่มต้นแอปและสไตล์กลาง (Dark Theme)
        ├── services/
        │   └── api.js                # ฟังก์ชันเชื่อมต่อ REST API, File Upload, และ SSE Stream
        ├── components/               # คอมโพเนนต์ UI ที่ใช้ซ้ำ
        │   ├── Navbar.jsx & .css     # แถบนำทางด้านบนและไฟสถานะการเชื่อมต่อ
        │   ├── DeviceForm.jsx & .css # ฟอร์ม Target Device, Fleet List, และ Modal Import IP
        │   ├── TerminalOutput.jsx & .css # หน้าต่าง CLI Console พร้อมระบบ Masking รหัสผ่าน
        │   └── AsyncJobModal.jsx & .css  # หน้าต่างติดตามสถานะงาน Fleet 10,000+ แบบ Real-time
        └── pages/                    # หน้าจอหลักตามฟังก์ชัน
            ├── HealthCheckPage.jsx & .css    # หน้าตรวจสุขภาพอุปกรณ์และจัดการ Command Profiles
            ├── TroubleshootPage.jsx & .css   # หน้าวินิจฉัยปัญหาและรันชุดคำสั่ง Profile
            ├── DeployConfigPage.jsx & .css   # หน้าพุชคอนฟิกขึ้นอุปกรณ์
            └── TemplateStudioPage.jsx & .css # หน้าออกแบบและทดสอบเรนเดอร์ Jinja2 Config Templates

```

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

## ข้อควรระวังและการดูแลรักษาความปลอดภัย (Security & Best Practices)

1. **การปกปิดรหัสผ่านใน Log (Credential Masking)**: ระบบหน้าจอ Terminal Output มีฟังก์ชัน Masking คำสั่งคอนฟิกที่มีรหัสผ่าน เช่น `password`, `secret`, `pre-shared-key` ไม่ให้แสดงข้อความจริงบนหน้าจอ
2. **การจัดเก็บไฟล์ `.env`**: ไฟล์ `.env` ที่บรรจุรหัสผ่านและค่าคอนฟิกลับถูกระบุไว้ใน `.gitignore` เรียบร้อยแล้ว เพื่อป้องกันไม่ให้ถูกอัปโหลดขึ้น Git Repository
3. **การเข้าถึงอุปกรณ์จริง**: ตรวจสอบการอนุญาตสิทธิ์บน Firewall หรือ Access Control List (ACL) ของอุปกรณ์เครือข่าย ให้เปิดพอร์ต SSH (22) หรือ Telnet (23) จาก IP ของ Host Server ที่รันระบบนี้
