# NetAuto for Windows — คู่มือติดตั้งและใช้งาน

NetAuto คือเครื่องมือจัดการอุปกรณ์เครือข่าย (Huawei / Cisco) ผ่าน SSH ทำงานในเบราว์เซอร์ แต่ตัวโปรแกรมรันอยู่บนเครื่องคุณเอง
แพ็กมาเป็นไฟล์เดียว `NetAuto.exe` — **ไม่ต้องลง Docker, Python หรือ Node.js**

- **Health Check** — ตรวจสุขภาพอุปกรณ์ทั้ง fleet (CPU, Memory, Interface, SFP, Hardware, Routing, Log)
- **Troubleshoot & CLI** — รันคำสั่งหลายเครื่องพร้อมกัน, ping / traceroute จากตัวอุปกรณ์, ค้น log
- **Deploy Config** — ส่ง config พร้อม backup, pre/post-check และ rollback
- **LLDP Discovery** — ไล่หาอุปกรณ์ที่ต่อกันผ่าน LLDP แล้ววาดเป็นแผนผัง topology แก้ไขได้ export ได้

> README นี้เป็นคู่มือผู้ใช้ของ branch `download-application` — ส่วนสำหรับนักพัฒนา (สถาปัตยกรรม, Docker, API) อยู่ใน README ของ branch `main`

---

## สารบัญ

1. [ความต้องการของระบบ](#1-ความต้องการของระบบ)
2. [ดาวน์โหลด](#2-ดาวน์โหลด)
3. [ติดตั้งและเปิดครั้งแรก](#3-ติดตั้งและเปิดครั้งแรก)
4. [ตั้งค่าก่อนใช้งาน](#4-ตั้งค่าก่อนใช้งาน)
5. [การใช้งานแต่ละหน้า](#5-การใช้งานแต่ละหน้า)
6. [ข้อมูลเก็บไว้ที่ไหน / Backup](#6-ข้อมูลเก็บไว้ที่ไหน--backup)
7. [อัปเดตเวอร์ชันและถอนการติดตั้ง](#7-อัปเดตเวอร์ชันและถอนการติดตั้ง)
8. [แก้ปัญหาที่พบบ่อย](#8-แก้ปัญหาที่พบบ่อย)
9. [สำหรับผู้พัฒนา: build เอง](#9-สำหรับผู้พัฒนา-build-เอง)

---

## 1. ความต้องการของระบบ

| รายการ | ต้องมี |
| :--- | :--- |
| ระบบปฏิบัติการ | Windows 10 / 11 (64-bit) |
| เบราว์เซอร์ | Chrome, Edge หรือ Firefox รุ่นปัจจุบัน |
| พื้นที่ดิสก์ | ~30 MB สำหรับโปรแกรม + พื้นที่สำหรับ log การสแกน |
| เครือข่าย | เครื่องนี้ต้อง SSH ไปอุปกรณ์ได้ (TCP 22 หรือพอร์ตที่ตั้งไว้) |
| บัญชีอุปกรณ์ | username / password ที่ SSH เข้าอุปกรณ์ได้ (Cisco อาจต้องมี enable secret) |

ไม่ต้องใช้สิทธิ์ Administrator ในการเปิดโปรแกรม

---

## 2. ดาวน์โหลด

ดาวน์โหลดเวอร์ชันล่าสุดได้ที่หน้า Releases → **NetAuto for Windows (latest build)**

**https://github.com/Imgoingtosleep/deploy-config-38ghfa2n8ds/releases/tag/app-latest**

กดที่ไฟล์ **`NetAuto.exe`** ในหัวข้อ *Assets* เพื่อดาวน์โหลด

> ไฟล์นี้ถูก build ใหม่อัตโนมัติทุกครั้งที่มีการอัปเดต branch `download-application` ลิงก์ด้านบนจึงชี้ไปเวอร์ชันล่าสุดเสมอ

---

## 3. ติดตั้งและเปิดครั้งแรก

ไม่มีตัวติดตั้ง — `NetAuto.exe` คือตัวโปรแกรมเลย

1. ย้าย `NetAuto.exe` ไปไว้ในโฟลเดอร์ที่ต้องการ เช่น `C:\Tools\NetAuto\` (หรือเปิดจาก Downloads ก็ได้)
2. **ดับเบิลคลิก** `NetAuto.exe`
3. ครั้งแรกจะมีหน้าจอสีน้ำเงิน *"Windows protected your PC"* (Windows SmartScreen) เพราะไฟล์ยังไม่ได้ sign
   → กด **More info** → **Run anyway**
4. จะมีหน้าต่างสีดำ (console) ขึ้นมาแสดง:
   ```
   ============================================================
    NetAuto is running at http://127.0.0.1:4050
    Data folder: C:\Users\<ชื่อคุณ>\AppData\Roaming\NetAuto
    Close this window to stop the app.
   ============================================================
   ```
5. เบราว์เซอร์จะเปิดหน้า NetAuto ให้อัตโนมัติภายในไม่กี่วินาที
   ถ้าไม่เปิดเอง ให้เปิดเบราว์เซอร์แล้วพิมพ์ที่อยู่ที่แสดงใน console (ปกติคือ `http://127.0.0.1:4050`)

**ปิดโปรแกรม:** ปิดหน้าต่าง console (กด X) — ปิดแค่แท็บเบราว์เซอร์โปรแกรมยังทำงานอยู่

> การเปิดครั้งแรกอาจช้ากว่าปกติ 5–15 วินาที เพราะโปรแกรมต้องแตกไฟล์ภายในก่อน
>
> โปรแกรมรับการเชื่อมต่อเฉพาะจากเครื่องนี้ (`127.0.0.1`) คนอื่นในเครือข่ายเปิดหน้าเว็บของคุณไม่ได้

---

## 4. ตั้งค่าก่อนใช้งาน

### 4.1 Credential Profile (บัญชีสำหรับ SSH)

เปิดครั้งแรกจะมีโปรไฟล์ตัวอย่าง (Huawei / Cisco / NOC Monitor) ที่ **รหัสผ่านว่าง** — ต้องใส่ของจริงก่อนใช้

1. ที่ส่วน **SSH Credential Profile** เหนือรายการอุปกรณ์ เลือกโปรไฟล์แล้วกดแก้ไข (หรือสร้างใหม่)
2. ใส่ username / password (และ enable secret ถ้ามี) เรียงลำดับ **Priority 1 → 2 → 3**
   โปรแกรมจะลองทีละชุดจนเข้าได้ และบันทึกว่าเข้าด้วยชุดไหน
3. เลือก Device type ของโปรไฟล์ (`huawei`, `cisco_ios` หรือ `autodetect`)

> ⚠️ ถ้าใช้บัญชี TACACS / RADIUS การ login ผิดหลายครั้งอาจทำให้บัญชีถูกล็อก — **ใส่ชุดที่ถูกต้องไว้ Priority 1 เสมอ**

### 4.2 Fleet Device Inventory (รายการอุปกรณ์)

ทุกหน้าใช้รายการอุปกรณ์ชุดเดียวกัน เพิ่มได้ 2 วิธี:

- **เพิ่มทีละเครื่อง** — กรอก IP / ชื่อ / device type ในตาราง
- **Import จากไฟล์** — รองรับ CSV, Excel, JSON, YAML, TXT มีปุ่มดาวน์โหลดไฟล์ template ให้

> **สำคัญ:** รายการอุปกรณ์เก็บไว้ในหน้าเว็บเท่านั้น **รีเฟรชหน้าหรือปิดโปรแกรมแล้วรายการจะหาย**
> แนะนำให้เก็บรายการไว้เป็นไฟล์ Excel/CSV แล้ว Import ทุกครั้งที่เปิดใช้

สิ่งที่ **ไม่หาย** เมื่อปิดโปรแกรม: Credential Profiles, Command Profiles, Model Rules, Playbooks, Templates และ log การสแกน (ดู [ข้อ 6](#6-ข้อมูลเก็บไว้ที่ไหน--backup))

---

## 5. การใช้งานแต่ละหน้า

### 5.1 Health Check

1. เลือก preset: Standard, Interfaces, Transceiver (SFP), Hardware/Environment, Routing & ARP, System Logs หรือ Playbook ที่สร้างเอง
2. กดรัน — ผลแสดงรายเครื่อง พร้อมสรุป CPU %, Memory %, จำนวน interface ที่ up
3. งานกับอุปกรณ์จำนวนมากจะรันเป็น background job มีแถบความคืบหน้า, ETA และยกเลิกกลางทางได้
4. Export ผลเป็น ZIP (สรุป CSV + raw log รายเครื่อง)

### 5.2 Troubleshoot & CLI

- พิมพ์หลายคำสั่ง (บรรทัดละคำสั่ง) รันพร้อมกันทั้ง fleet ใส่ **regex filter** ต่อคำสั่งเพื่อตัดเอาเฉพาะบรรทัดที่สนใจได้
- Ping / Traceroute **จากตัวอุปกรณ์**, ค้นหาใน log buffer ด้วย keyword
- ผลลัพธ์ปิดบัง password / secret ให้อัตโนมัติ มีปุ่ม copy

### 5.3 Deploy Config

1. เขียน config เอง หรือเลือกจาก Template Snippets (Huawei / Cisco / Aruba / Juniper) หรือใช้ GUI Config Builder
2. ขั้นตอนในงานเดียว: **Pre-check → Backup running-config → Push → Save → Post-check** พร้อมคำสั่ง Rollback
3. ดูผลรายเครื่องและประวัติการ deploy ได้

> ทดสอบกับอุปกรณ์ lab หรือเครื่องเดียวก่อนเสมอ ก่อน deploy ทั้ง fleet

### 5.4 LLDP Discovery และ Topology

**เลือกโหมด**

| โหมด | ใช้เมื่อ |
| :--- | :--- |
| **Seed Devices** | เริ่มจากอุปกรณ์ในรายการ Fleet |
| **Subnet Scan** | ไม่รู้ว่ามีอุปกรณ์อะไรบ้าง — ใส่ CIDR / range / IP เช่น `10.10.0.0/24`, `10.20.5.10-10.20.5.50` และ Exclude ได้ |

**ตั้งค่าที่ควรรู้**

- **TCP Pre-Check** — เช็กพอร์ต 22 ก่อน SSH เพื่อข้าม IP ที่ไม่มีเครื่อง (เร็วขึ้นมากตอนสแกน subnet)
- **Command Profile Priority (C1, C2, C3 …)** — ลำดับชุดคำสั่ง เช่น Huawei ก่อนแล้วค่อย Cisco ถ้าอุปกรณ์ไม่รับคำสั่งชุดแรก โปรแกรมจะลองชุดถัดไปบน session เดิม กด **Add priority** เพิ่มลำดับได้ และกด **Manage** เพื่อสร้างชุดคำสั่งสำหรับยี่ห้ออื่น
- **Recursive discovery** — SSH ต่อไปยังเพื่อนบ้านที่เจอจาก LLDP management IP (ตั้ง Max depth ได้)
  - อุปกรณ์ที่อยู่ใน Fleet อยู่แล้ว หรือเคย SSH ไปแล้ว จะไม่ถูก SSH ซ้ำ
  - เพื่อนบ้านที่ยังไม่รู้ยี่ห้อ จะถูกลอง login ตามลำดับ Command Profile (เช่น Huawei แล้วค่อย Cisco)
  - เพื่อนบ้านใช้ Credential Profile เดียวกับอุปกรณ์ต้นทาง — ถ้าเป็นคนละบัญชี ให้ใส่เพิ่มเป็นอีก priority ในโปรไฟล์

**ดูผล**

- แท็บ **Neighbors** (ตาราง LLDP), **Summary** (สถานะรายเครื่อง + log การ SSH — กดขยายแถวเพื่อดู raw output) และ **Topology**
- **Export Excel** ได้ทั้งตาราง LLDP, สรุป และ raw log
- Subnet Scan เขียนผลลงดิสก์ทีละเครื่องทันที ปิดเบราว์เซอร์ระหว่างสแกนก็ไม่หาย และโหลด ZIP ผลได้

**Topology Editor** — กด **Edit** เหนือภาพ

| เครื่องมือ | คีย์ลัด | ใช้ทำอะไร |
| :--- | :---: | :--- |
| Select / move | `V` | ลากย้าย, ดับเบิลคลิกเพื่อแก้ interface |
| Add device | `N` | คลิกบนพื้นที่ว่างเพื่อเพิ่มอุปกรณ์ |
| Connect | `C` | ลากจากอุปกรณ์หนึ่งไปอีกตัว แล้วเลือก interface |
| Traffic flow | `T` | คลิกอุปกรณ์ตามลำดับเส้นทาง Enter เพื่อจบ |
| Zone | `Z` | ลากกรอบพื้นที่ (Site, DMZ, VLAN, Rack) |
| Note | `A` | ใส่ข้อความ |
| Delete | `X` | คลิกสิ่งที่ต้องการลบ |

| การทำงาน | วิธี |
| :--- | :--- |
| เลือกหลายตัว | `Shift` + ลากกรอบ, `Shift` + คลิก, `Ctrl+A` เลือกทั้งหมด |
| จัดแนว / กระจายระยะ | เลือก 2 ตัวขึ้นไป แล้วใช้แถบเครื่องมือด้านล่าง |
| จัดผังใหม่เฉพาะที่เลือก | เลือก 3 ตัวขึ้นไป แล้วกดปุ่มตารางในแถบด้านล่าง |
| ทำสำเนา / คัดลอก / วาง | `Ctrl+D` / `Ctrl+C` / `Ctrl+V` |
| ค้นหาอุปกรณ์ | `Ctrl+F` (กดซ้ำเพื่อปิด) |
| ย้อนกลับ / ทำซ้ำ | `Ctrl+Z` / `Ctrl+Y` |
| ซูม | ลูกกลิ้งเมาส์ หรือปุ่ม `− % +` มุมขวาล่าง |
| ซ่อนอุปกรณ์บางชนิด | คลิกชิปใน legend ด้านบน (เช่น ซ่อน PC / AP) |
| จัดให้ตรงแนว | ลากแล้วจะมีเส้นไกด์สีชมพูเมื่อตรงแนวกับตัวอื่น |

Export ภาพเป็น **SVG / PNG / draw.io** และ **Import กลับมาแก้ต่อ** ได้จาก `.drawio / .svg / .png / .zip / .json` (ลากไฟล์วางบนภาพได้เลย)

**Model Rules (สอนชื่อรุ่นใหม่)**

ถ้าอุปกรณ์ขึ้นเป็น **Unknown model** (เช่น FortiGate, Aruba, Ruijie) ให้กด **Teach model**:

1. เลือกข้อความตัวอย่างจากผลสแกน (ผลของคำสั่ง version หรือ LLDP System description)
2. ใช้เมาส์ลากคลุมชื่อรุ่นในข้อความ — โปรแกรมสร้างกฎให้เอง
3. เลือกชนิดอุปกรณ์ (Switch, Router, Firewall, Wireless …) แล้วกด **Save & apply to result**

ใต้ภาพ topology มีแผง **Model → Icon** บอกว่ารุ่นไหนแสดงเป็นไอคอนอะไร และมาจากกฎไหน

---

## 6. ข้อมูลเก็บไว้ที่ไหน / Backup

ข้อมูลทั้งหมดอยู่ที่ **`%APPDATA%\NetAuto`** (พิมพ์ในช่องที่อยู่ของ File Explorer ได้เลย)

| ไฟล์ / โฟลเดอร์ | เก็บอะไร |
| :--- | :--- |
| `credential_profiles.json` | Credential Profiles (**มี username / password**) |
| `command_profiles.json` | ชุดคำสั่ง LLDP |
| `model_rules.json` | กฎอ่านชื่อรุ่น |
| `playbooks.json` | Command profiles ของ Health Check / Troubleshoot |
| `templates.json` | Config templates |
| `logs\lldp\` | log และผลของ Subnet Scan แต่ละครั้ง |

- **Backup / ย้ายไปเครื่องใหม่:** ก๊อปทั้งโฟลเดอร์ `%APPDATA%\NetAuto` ไปไว้ที่ตำแหน่งเดียวกันบนเครื่องใหม่
- **รีเซ็ตเป็นค่าเริ่มต้น:** ปิดโปรแกรม ลบไฟล์ที่ต้องการในโฟลเดอร์นี้ แล้วเปิดใหม่
- ⚠️ รหัสผ่านในไฟล์ `credential_profiles.json` **ไม่ได้เข้ารหัส** — อย่าส่งไฟล์นี้ให้ผู้อื่น และระวังเมื่อใช้เครื่องร่วมกับคนอื่น
- ไฟล์ `NetAuto.exe` เองไม่มี credential ของใครติดไป ส่งต่อให้คนอื่นได้

---

## 7. อัปเดตเวอร์ชันและถอนการติดตั้ง

**อัปเดต**
1. ปิดโปรแกรมเดิม (ปิดหน้าต่าง console)
2. ดาวน์โหลด `NetAuto.exe` ใหม่จาก [ลิงก์ในข้อ 2](#2-ดาวน์โหลด) มาแทนที่ไฟล์เดิม
3. เปิดใหม่ — ข้อมูลใน `%APPDATA%\NetAuto` ยังอยู่ครบ

**ถอนการติดตั้ง**
1. ลบไฟล์ `NetAuto.exe`
2. (ถ้าต้องการลบข้อมูลด้วย) ลบโฟลเดอร์ `%APPDATA%\NetAuto`

---

## 8. แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
| :--- | :--- |
| Windows ขึ้น *"Windows protected your PC"* | กด **More info → Run anyway** (ไฟล์ไม่ได้ sign) |
| Antivirus กักไฟล์ / ลบไฟล์ | เพิ่ม `NetAuto.exe` เป็นข้อยกเว้น แล้วดาวน์โหลดใหม่ |
| เบราว์เซอร์ไม่เปิดเอง | เปิดเบราว์เซอร์แล้วพิมพ์ที่อยู่ที่แสดงใน console |
| ที่อยู่ไม่ใช่ `:4050` | พอร์ต 4050 ถูกโปรแกรมอื่นใช้อยู่ โปรแกรมเลือกพอร์ตว่างให้แทน — ใช้ที่อยู่ตามที่ console แสดง |
| หน้าต่าง console ปิดเองทันที | เปิด Command Prompt แล้วรัน `NetAuto.exe` จากในนั้น จะเห็นข้อความ error |
| รายการอุปกรณ์หายหลังรีเฟรช | เป็นพฤติกรรมปกติ — Import รายการจากไฟล์ใหม่ (ดู [ข้อ 4.2](#42-fleet-device-inventory-รายการอุปกรณ์)) |
| **Auth Failed** | ตรวจ username / password / ลำดับ priority ใน Credential Profile — ระวังบัญชีถูกล็อก |
| **Unreachable** / TCP closed | เครื่องนี้ไปถึงพอร์ต SSH ของอุปกรณ์ไม่ได้ (ACL, firewall, VPN) — ลองใน PowerShell: `Test-NetConnection <ip> -Port 22` |
| Recursive SSH เข้าเพื่อนบ้านไม่ได้ | ดู log ในแท็บ Summary — ส่วนใหญ่เป็นคนละบัญชี ให้ใส่เพิ่มเป็น priority ใน Credential Profile หรือขาด enable secret ของ Cisco |
| Topology ขึ้น **Unknown model** | ใช้ **Teach model** (ข้อ 5.4) หรือตรวจว่า Command Profile มีคำสั่ง version ของยี่ห้อนั้น |

**ต้องการใช้พอร์ตอื่นเป็นค่าเริ่มต้น** — สร้างไฟล์ `NetAuto.bat` ไว้ในโฟลเดอร์เดียวกับ exe แล้วเปิดโปรแกรมผ่านไฟล์นี้:
```bat
@echo off
set NETAUTO_PORT=5050
start "" "%~dp0NetAuto.exe"
```

---

## 9. สำหรับผู้พัฒนา: build เอง

**Build อัตโนมัติ (แนะนำ):** push ขึ้น branch `download-application` แล้ว GitHub Actions จะ build, ทดสอบเปิด exe และอัปเดต release `app-latest` ให้ (`.github/workflows/build-windows-exe.yml`)

เอาการแก้ไขล่าสุดจาก `main` มา build:
```bash
git checkout download-application
git merge main
git push
```

**Build บนเครื่อง Windows** (ต้องมี Python 3.11+ และ Node.js 18+):
```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```
ได้ไฟล์ที่ `dist\NetAuto.exe`

| Environment variable | ใช้ทำอะไร |
| :--- | :--- |
| `NETAUTO_PORT` | พอร์ตที่ต้องการ (ค่าเริ่มต้น 4050) |
| `NETAUTO_DATA_DIR` | ย้ายโฟลเดอร์ข้อมูลไปที่อื่นแทน `%APPDATA%\NetAuto` |

ส่วนที่เกี่ยวกับการแพ็ก: `backend/run_app.py` (ตัวเปิดโปรแกรม), `backend/app/core/paths.py` (ตำแหน่งข้อมูล), `build.ps1`, `frontend/.env.exe`
