# Network Automation & Diagnostic Web Platform

เว็บแอปพลิเคชันสำหรับเชื่อมต่อ **Network Device (Switch / Router)** จากเครื่อง Server ของเรา เพื่อทำ:
- **Deploy Configuration**: พุชคำสั่งคอนฟิกขึ้น Switch พร้อมตัวเลือก Save Running-config (`write memory` / `save`)
- **Automated Health Check**: รันชุดคำสั่งตรวจสุขภาพอุปกรณ์แบบ One-Click (Interface, Hardware, CPU/Memory, Routing, Logs)
- **Troubleshoot & Interactive CLI**: ตรวจสอบสถานะ, Run Show Command แบบ Real-time, Ping ออกจาก Switch, ตรวจ MAC Table, ARP Table

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
deploy-config/
├── .env                    # Environment variables (Frontend 4000, Backend 4050)
├── .env.example            # ตัวอย่างไฟล์ .env
├── .gitignore              # ละเว้น node_modules, .venv, cache, logs
├── docker-compose.yml      # Orchestrate Frontend & Backend containers
├── README.md               # เอกสารคู่มือการใช้งาน
│
├── backend/                # Python FastAPI + Netmiko / Nornir Backend
│   ├── Dockerfile
│   ├── requirements.txt    # fastapi, uvicorn, netmiko, paramiko, nornir, pydantic
│   └── app/
│       ├── main.py         # FastAPI Entrypoint & CORS
│       ├── core/
│       │   └── config.py   # Settings & Environment Parser
│       ├── schemas/        # Data validation models
│       │   ├── device.py   # Device credentials & test schemas
│       │   └── command.py  # Health check & Deploy payload schemas
│       ├── services/       # Network automation logic
│       │   ├── netmiko_service.py # SSH, Show commands, Config set, Save
│       │   └── nornir_service.py  # Concurrent multi-threading interface
│       └── api/
│           └── endpoints/
│               ├── devices.py     # Test SSH connection & device types
│               ├── healthcheck.py # Presets for Cisco, Huawei, etc.
│               ├── troubleshoot.py# Custom CLI & ping execution
│               └── deploy.py      # Push configuration batches
│
└── frontend/               # React (Vite + Modular CSS) Frontend
    ├── Dockerfile          # Multi-stage build + Nginx listen พอร์ต 4000
    ├── nginx.conf          # Nginx Configuration
    ├── package.json        # Configured for Port 4000
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx & App.css           # Main Layout & Tab Viewport
        ├── main.jsx & index.css        # Entrypoint & Base Theme
        ├── services/
        │   └── api.js                  # Axios client calling port 4050
        ├── components/                 # Reusable UI Components
        │   ├── Navbar.jsx & .css       # Header & Connection Indicator
        │   ├── DeviceForm.jsx & .css   # SSH Credentials & Connection Tester
        │   └── TerminalOutput.jsx & .css # CLI Console Viewer (Copy/Download)
        └── pages/                      # Feature Screen Pages
            ├── HealthCheckPage.jsx & .css  # Automated Health Diagnostics Page
            ├── TroubleshootPage.jsx & .css # Interactive CLI & Ping Page
            └── DeployConfigPage.jsx & .css # Config Script Editor & Deployer
```

---

## การตั้งค่า Environment Variables (`.env`)

ไฟล์ `.env` ถูกตั้งค่าเริ่มต้นไว้ดังนี้:

```env
FRONTEND_PORT=4000
BACKEND_PORT=4050
BACKEND_HOST=0.0.0.0
VITE_API_BASE_URL=http://localhost:4050
DEFAULT_DEVICE_TYPE=cisco_ios
DEFAULT_SSH_PORT=22
DEFAULT_TIMEOUT=30
GLOBAL_DELAY_FACTOR=1
```

---

## วิธีการรันระบบ (Quick Start)

### วิธีที่ 1: รันด้วย Docker Compose (แนะนำ)

สั่ง build และรันทั้ง Frontend และ Backend ได้ทันทีด้วยคำสั่งเดียว:

```bash
docker compose up --build -d
```

- **Frontend Web UI**: [http://localhost:4000](http://localhost:4000)
- **Backend API Docs (Swagger)**: [http://localhost:4050/docs](http://localhost:4050/docs)

หยุดการทำงาน:
```bash
docker compose down
```

---

### วิธีที่ 2: รันแยกแบบ Local Development

#### 1. รัน Backend (Python):
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # บน Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 4050 --reload
```

#### 2. รัน Frontend (React):
```bash
cd frontend
npm install
npm run dev
```

---

## อุปกรณ์ที่รองรับ (Supported Network Devices)

ระบบรองรับไดรเวอร์จาก Netmiko ครอบคลุมผู้ผลิตชั้นนำ:
- `cisco_ios` / `cisco_xe` (Cisco Catalyst, ISR, ASR, etc.)
- `cisco_nxos` (Cisco Nexus)
- `huawei` / `huawei_vrpv8` (Huawei Quidway, CloudEngine)
- `aruba_os` (Aruba / HP ProCurve / CX)
- `juniper_junos` (Juniper EX, SRX)
- `mikrotik_routeros`
- `linux` / `generic_termserver`
