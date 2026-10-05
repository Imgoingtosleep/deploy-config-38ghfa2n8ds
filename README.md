# NetAuto for Windows — คู่มือติดตั้งและใช้งาน

NetAuto คือเครื่องมือจัดการอุปกรณ์เครือข่ายระดับองค์กร (Huawei, Cisco, FortiGate, Raisecom, Aruba, Juniper, H3C/Comware, MikroTik, Linux) ผ่าน SSH ทำงานในเบราว์เซอร์ แต่ตัวโปรแกรมรันอยู่บนเครื่องคุณเอง
แพ็กมาเป็นไฟล์เดียว `NetAuto.exe` — **ไม่ต้องลง Docker, Python หรือ Node.js**

- **Health Check** — ตรวจสุขภาพอุปกรณ์ทั้ง fleet (CPU, Memory, Interface, SFP, Hardware, Routing, Log)
- **Troubleshoot & CLI** — รันคำสั่งหลายเครื่องพร้อมกัน, ping / traceroute จากตัวอุปกรณ์, ค้น log buffer พร้อม regex filter
- **Deploy Config** — ส่ง config พร้อม backup, pre/post-check, rollback, **Template Studio** (ระบบ Template พร้อมตัวแปร `{{VARIABLE}}`) และ **Scheduled Deploy** (ตั้งเวลา Deploy ล่วงหน้าแบบครั้งเดียวหรือวนซ้ำ พร้อม Audit Log รายเครื่อง)
- **LLDP Discovery & Topology** — ตรวจหาอุปกรณ์และสแกนผังเครือข่ายอัตโนมัติ (Auto-Detect Driver), วาดผัง Topology อัจฉริยะ, Topology Editor ลากวางแก้ไขได้, รองรับ Custom Regex Parser, Model Rules (สอนชื่อรุ่นใหม่), และ Import/Export ไปยัง draw.io / SVG / PNG / Excel

> README นี้เป็นคู่มือผู้ใช้ของ branch `download-application` — ส่วนสำหรับนักพัฒนา (สถาปัตยกรรม, Docker, API Reference) อยู่ใน README ของ branch `main`

---

## สารบัญ

1. [ความต้องการของระบบ](#1-ความต้องการของระบบ)
2. [ดาวน์โหลด](#2-ดาวน์โหลด)
3. [ติดตั้งและเปิดครั้งแรก](#3-ติดตั้งและเปิดครั้งแรก)
4. [ตั้งค่าก่อนใช้งาน](#4-ตั้งค่าก่อนใช้งาน)
5. [การใช้งานแต่ละหน้า](#5-การใช้งานแต่ละหน้า)
   - 5.1 [Health Check](#51-health-check)
   - 5.2 [Troubleshoot & CLI](#52-troubleshoot--cli)
   - 5.3 [Deploy Config, Templates & Scheduled Deploy](#53-deploy-config-templates--scheduled-deploy)
   - 5.4 [LLDP Discovery & Topology Editor](#54-lldp-discovery--topology-editor)
   - 5.5 [Model Rules (สอนชื่อรุ่นใหม่)](#55-model-rules-สอนชื่อรุ่นใหม่)
6. [ข้อมูลเก็บไว้ที่ไหน / Backup](#6-ข้อมูลเก็บไว้ที่ไหน--backup)
7. [อัปเดตเวอร์ชันและถอนการติดตั้ง](#7-อัปเดตเวอร์ชันและถอนการติดตั้ง)
8. [แก้ปัญหาที่พบบ่อย](#8-แก้ปัญหาที่พบบ่อย)
9. [อุปกรณ์และยี่ห้อที่รองรับ (Device Drivers)](#9-อุปกรณ์และยี่ห้อที่รองรับ-device-drivers)
10. [สำหรับผู้พัฒนา: build เอง](#10-สำหรับผู้พัฒนา-build-เอง)

---

## 1. ความต้องการของระบบ

| รายการ | ต้องมี |
| :--- | :--- |
| ระบบปฏิบัติการ | Windows 10 / 11 (64-bit) |
| เบราว์เซอร์ | Chrome, Edge หรือ Firefox รุ่นปัจจุบัน |
| พื้นที่ดิสก์ | ~35 MB สำหรับโปรแกรม + พื้นที่สำหรับ log การสแกน |
| เครือข่าย | เครื่องนี้ต้อง SSH ไปอุปกรณ์ได้ (TCP 22 หรือพอร์ตที่ตั้งไว้) |
| บัญชีอุปกรณ์ | username / password ที่ SSH เข้าอุปกรณ์ได้ (Cisco อาจต้องมี enable secret) |

ไม่ต้องใช้สิทธิ์ Administrator ในการเปิดโปรแกรม

---

## 2. ดาวน์โหลด

ดาวน์โหลดเวอร์ชันล่าสุดได้ที่หน้า Releases → **NetAuto for Windows (latest build)**

- **หน้ารวม Releases:** [GitHub Releases: app-latest](https://github.com/Imgoingtosleep/deploy-config-38ghfa2n8ds/releases/tag/app-latest)
- **ดาวน์โหลดโปรแกรมโดยตรง:** [ดาวน์โหลด NetAuto.exe](https://github.com/Imgoingtosleep/deploy-config-38ghfa2n8ds/releases/download/app-latest/NetAuto.exe)

> ไฟล์นี้ถูก build ใหม่อัตโนมัติทุกครั้งที่มีการ push อัปเดตขึ้น branch `download-application` ลิงก์ด้านบนจึงชี้ไปเวอร์ชันล่าสุดเสมอ

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

เปิดครั้งแรกจะมีโปรไฟล์ตัวอย่างที่รหัสผ่านว่าง — ต้องใส่ของจริงก่อนใช้:

1. ที่ส่วน **SSH Credential Profile** เหนือรายการอุปกรณ์ เลือกโปรไฟล์แล้วกดแก้ไข (หรือสร้างใหม่)
2. ใส่ username / password (และ enable secret ถ้ามี) เรียงลำดับ **Priority 1 → 2 → 3**
   โปรแกรมจะลองทีละชุดจนเข้าได้ และบันทึกว่าเข้าด้วยชุดไหน
3. เลือก Device type ของโปรไฟล์:
   - แนะนำ: `Auto Detect (Recommended)` — ระบบจะตรวจหา vendor อัตโนมัติเมื่อ login
   - หรือเจาะจง: `huawei`, `cisco_ios`, `fortinet`, `raisecom_roap` ฯลฯ

> ⚠️ ถ้าใช้บัญชี TACACS / RADIUS การ login ผิดหลายครั้งอาจทำให้บัญชีถูกล็อก — **ใส่ชุดที่ถูกต้องไว้ Priority 1 เสมอ**

### 4.2 Fleet Device Inventory (รายการอุปกรณ์)

ทุกหน้าใช้รายการอุปกรณ์ชุดเดียวกัน เพิ่มได้ 2 วิธี:

- **เพิ่มทีละเครื่อง** — กรอก IP / ชื่อ / device type ในตาราง (แนะนำตั้ง device type เป็น `Auto Detect`)
- **Import จากไฟล์** — รองรับ CSV, Excel, JSON, YAML, TXT มีปุ่มดาวน์โหลดไฟล์ template ให้

> **สำคัญ:** รายการอุปกรณ์เก็บไว้ในหน่วยความจำของหน้าเว็บเท่านั้น **รีเฟรชหน้าหรือปิดโปรแกรมแล้วรายการจะหาย**
> แนะนำให้เก็บรายการไว้เป็นไฟล์ Excel/CSV แล้ว Import ทุกครั้งที่เปิดใช้
>
> สิ่งที่ **ไม่หาย** เมื่อปิดโปรแกรม: Credential Profiles, Command Profiles, Model Rules, Playbooks, Config Templates, ตาราง Deploy Schedule และ log (ดู [ข้อ 6](#6-ข้อมูลเก็บไว้ที่ไหน--backup))

---

## 5. การใช้งานแต่ละหน้า

### 5.1 Health Check

1. เลือก preset: Standard, Interfaces, Transceiver (SFP), Hardware/Environment, Routing & ARP, System Logs หรือ Playbook ที่สร้างเอง
2. สามารถใช้ชุดคำสั่งที่กำหนดไว้ตาม Driver ของอุปกรณ์แต่ละเครื่องได้โดยตรง
3. กดรัน — ผลแสดงรายเครื่อง พร้อมสรุป CPU %, Memory %, จำนวน interface ที่ up
4. งานกับอุปกรณ์จำนวนมากจะรันเป็น background job มีแถบความคืบหน้า, ETA และยกเลิกกลางทางได้
5. Export ผลเป็น ZIP (สรุป CSV + raw log รายเครื่อง)

### 5.2 Troubleshoot & CLI

- พิมพ์หลายคำสั่ง (บรรทัดละคำสั่ง) รันพร้อมกันทั้ง fleet
- ใส่ **regex filter** ต่อท้ายคำสั่งเพื่อตัดเอาเฉพาะบรรทัดที่สนใจได้ เช่น `display ip interface brief | include Up`
- Ping / Traceroute **จากตัวอุปกรณ์**, ค้นหาใน log buffer ด้วย keyword
- ผลลัพธ์ปิดบัง password / secret ให้อัตโนมัติ มีปุ่ม copy ข้อความ

### 5.3 Deploy Config, Templates & Scheduled Deploy

หน้านี้รวมเครื่องมือส่ง Config, ระบบจัดการ Template และการตั้งเวลา Deploy อัตโนมัติ:

#### 1) การ Deploy ทันที (Run Now)
- เขียน Config เอง หรือเลือกจาก Template
- ทำงานครบวงจรในงานเดียว:
  1. **Pre-check**: รันคำสั่งตรวจสภาพก่อนส่ง config
  2. **Backup running-config**: บันทึก config เดิมเก็บไว้ก่อนเสมอ
  3. **Push config**: ส่งคำสั่งตั้งค่าไปยังอุปกรณ์
  4. **Save config**: บันทึก startup-config / write memory อัตโนมัติ
  5. **Post-check**: ตรวจสอบผลลัพธ์หลังการตั้งค่า
  6. **Rollback**: เตรียมชุดคำสั่งย้อนกลับกรณีต้องการกู้คืน

#### 2) Template Studio (Deploy Config Templates)
- บันทึกบล็อกคำสั่ง Config สำหรับยี่ห้อต่าง ๆ (Huawei, Cisco, Aruba, Juniper ฯลฯ) แยกตามหมวดหมู่
- รองรับการใส่ตัวแปร placeholder เช่น `{{VLAN_ID}}`, `{{IP_ADDRESS}}`, `{{DESCRIPTION}}`
- เมื่อเลือก Template มาใช้งาน หน้าเว็บจะมีฟอร์มป๊อปอัปให้กรอกค่าตัวแปร และแทนที่ลงใน Config ให้อัตโนมัติ
- มี Built-in Templates พร้อมใช้งาน และสามารถซ่อน Template ที่ไม่ต้องการได้ถาวร

#### 3) Scheduled Deploy (ตั้งเวลา Deploy ล่วงหน้า)
- ตั้งเวลา Deploy ล่วงหน้าตามวัน/เวลาที่ต้องการ (ใช้วันเวลาและ Timezone ของเครื่องคุณเอง)
- กำหนดเงื่อนไขการทำงาน:
  - **ครั้งเดียว (Once)**: ทำงานตามเวลาที่กำหนด
  - **วนซ้ำ (Recurring)**: รายชั่วโมง (Hourly), รายวัน (Daily), หรือรายสัปดาห์ (Weekly พร้อมเลือกวัน จันทร์–อาทิตย์)
  - กำหนด Deadline หรือจำนวนรอบสูงสุดได้
- มีแถบควบคุม: ดูสถานะ (Scheduled, Running, Finished, Failed, Cancelled), ปุ่ม **Run Now** สั่งรันทันที, และปุ่ม **Cancel** ยกเลิก
- **Audit Log**: บันทึกผลการ deploy รายเครื่องแบบเรียลไทม์ (กดดู log แยกตามแต่ละงานได้)

> 💡 แนะนำทดสอบกับอุปกรณ์ lab หรือเครื่องเดียวก่อนเสมอ ก่อน deploy ทั้ง fleet

### 5.4 LLDP Discovery & Topology Editor

#### เลือกโหมดการค้นหา
| โหมด | ใช้เมื่อ |
| :--- | :--- |
| **Seed Devices** | เริ่มจากอุปกรณ์ในรายการ Fleet |
| **Subnet Scan** | ไม่รู้ว่ามีอุปกรณ์อะไรบ้าง — ใส่ CIDR / range / IP เช่น `10.10.0.0/24`, `10.20.5.10-10.20.5.50` และ Exclude ได้ |

#### ตั้งค่าที่สำคัญ
- **Auto Detect Driver**: ตรวจหายี่ห้ออุปกรณ์อัตโนมัติ (Huawei, Cisco, FortiGate, Raisecom) ไม่ต้องระบุล่วงหน้า
- **TCP Pre-Check**: เช็กพอร์ต 22 ก่อน SSH ช่วยให้สแกน Subnet ขนาดใหญ่ได้รวดเร็วมาก
- **Command Profile Priority (C1, C2 …)**: ลำดับชุดคำสั่ง เช่น Huawei ก่อนแล้วค่อย Cisco ถ้าอุปกรณ์ไม่รับคำสั่งชุดแรก จะลองชุดถัดไปใน session เดิมทันที
- **Custom Regex Parser**: รองรับการสร้าง Regex (Python named group เช่น `(?P<neighbor_id>...)`) สำหรับถอดรหัส LLDP ของอุปกรณ์ยี่ห้อใหม่ ๆ พร้อมฟังก์ชัน **Test regex** และ **Sample output** ทดสอบกับข้อความจริง
- **Recursive discovery**: เดินทางต่อไปยังเพื่อนบ้านที่พบผ่าน LLDP management IP (ตั้ง Max depth ได้)

#### Topology Editor (กดปุ่ม Edit เหนือภาพ)
| เครื่องมือ | คีย์ลัด | ใช้ทำอะไร |
| :--- | :---: | :--- |
| Select / move | `V` | ลากย้ายตำแหน่ง, ดับเบิลคลิกเพื่อดูหรือแก้ไข Interface |
| Add device | `N` | คลิกบนพื้นที่ว่างเพื่อเพิ่มอุปกรณ์ใหม่ |
| Connect | `C` | ลากเส้นเชื่อมระหว่าง 2 อุปกรณ์ แล้วเลือก Interface |
| Traffic flow | `T` | คลิกเลือกอุปกรณ์ตามลำดับเส้นทาง กด Enter เพื่อสร้างเส้นแสดงทิศทางข้อมูล |
| Zone | `Z` | ลากกรอบพื้นที่ (Site, DMZ, VLAN, Rack, Floor) |
| Note | `A` | ใส่ป้ายข้อความกำกับบนแผนผัง |
| Delete | `X` | คลิกอุปกรณ์หรือเส้นที่ต้องการลบ |

| คีย์ลัดและการจัดการ | วิธี |
| :--- | :--- |
| เลือกหลายตัว | `Shift` + ลากกรอบ, `Shift` + คลิก, `Ctrl+A` เลือกทั้งหมด |
| ค้นหาอุปกรณ์ | `Ctrl+F` ค้นหาชื่อหรือ IP บน Topology (กดซ้ำเพื่อปิด) |
| จัดแนว / กระจายระยะ | เลือก 2 ตัวขึ้นไป แล้วใช้แถบเครื่องมือจัดแนว (ซ้าย, กลาง, ขวา, บน, กระจายเท่ากัน) |
| จัดผังอัตโนมัติ | เลือก 3 ตัวขึ้นไป แล้วกดปุ่ม Grid layout ในแถบเครื่องมือ |
| ทำสำเนา / คัดลอก / วาง | `Ctrl+D` / `Ctrl+C` / `Ctrl+V` |
| ย้อนกลับ / ทำซ้ำ | `Ctrl+Z` / `Ctrl+Y` |
| ซูม | หมุนลูกกลิ้งเมาส์ หรือกดปุ่ม `− % +` มุมขวาล่าง |
| ซ่อนอุปกรณ์บางชนิด | คลิกที่ปุ่มในแถบ Legend ด้านบน (เช่น ซ่อน AP, Phone, PC) |

#### การ Export / Import
- **Export**: บันทึกแผนผังเป็น **draw.io (.drawio)**, **SVG**, **PNG**, **Excel รายงานสรุป (.xlsx)**, หรือ JSON
- **Import**: ลากไฟล์ `.drawio`, `.svg`, `.png`, `.zip`, `.json` หรือตาราง Excel LLDP มาวางบนผังเพื่อเปิดแก้ไขต่อได้ทันที

### 5.5 Model Rules (สอนชื่อรุ่นใหม่)

ถ้าอุปกรณ์ในผลสแกนขึ้นเป็น **Unknown model** (เช่น FortiGate, Aruba, Ruijie, Raisecom รุ่นใหม่):
1. กดปุ่ม **Teach model**
2. เลือกข้อความตัวอย่างจากผลสแกน (ผลจากคำสั่ง version หรือ LLDP System description)
3. ใช้เมาส์ลากคลุมส่วนที่เป็นชื่อรุ่น — โปรแกรมจะวิเคราะห์และสร้าง Regular Expression ให้โดยอัตโนมัติ
4. เลือกชนิดอุปกรณ์ (Switch, Router, Firewall, Wireless, Server ฯลฯ) แล้วกด **Save & apply to result**
5. แผนผังจะอัปเดตไอคอนของอุปกรณ์ตามรุ่นที่สอนทันที

---

## 6. ข้อมูลเก็บไว้ที่ไหน / Backup

ข้อมูลทั้งหมดจะถูกจัดเก็บอยู่ที่ **`%APPDATA%\NetAuto`** บนเครื่องของคุณ (พิมพ์ `%APPDATA%\NetAuto` ในช่องที่อยู่ของ File Explorer ได้เลย)

| ไฟล์ / โฟลเดอร์ | รายละเอียดข้อมูล |
| :--- | :--- |
| `credential_profiles.json` | Credential Profiles สำหรับ SSH (**มี username / password**) |
| `command_profiles.json` | ชุดคำสั่งและ Parser สำหรับ LLDP Discovery |
| `model_rules.json` | กฎการแยกแยะชื่อรุ่นอุปกรณ์ (Model Rules) |
| `playbooks.json` | Command profiles ของ Health Check และ Troubleshoot |
| `templates.json` | Template เก่า / Snippets |
| `drivers.json` | รายการ Device Drivers และ Signature สำหรับ Auto-Detect |
| `config_templates.json` | Deploy Config Templates ที่สร้างเอง |
| `config_templates_hidden.json` | รายการ Built-in Templates ที่ถูกซ่อน |
| `scheduled_deploys.json` | รายการงาน Deploy ที่ตั้งเวลาล่วงหน้า |
| `logs\lldp\` | Log รายละเอียดผลการสแกน LLDP แต่ละครั้ง |
| `logs\deploy\` | Audit Log บันทึกประวัติและผลลัพธ์การ Deploy ตามกำหนดเวลา |

- **การย้ายเครื่อง / สำรองข้อมูล (Backup):** ก๊อปปี้โฟลเดอร์ `%APPDATA%\NetAuto` ไปวางในตำแหน่งเดียวกันบนเครื่องใหม่
- **การรีเซ็ตกลับเป็นค่าเริ่มต้น:** ปิดโปรแกรม ลบไฟล์ `.json` ที่ต้องการรีเซ็ตในโฟลเดอร์นี้ แล้วเปิดโปรแกรมใหม่
- ⚠️ รหัสผ่านใน `credential_profiles.json` **ไม่ได้เข้ารหัส** — ระมัดระวังอย่ายกไฟล์นี้ให้ผู้อื่น หรือเปิดทิ้งไว้บนเครื่องส่วนกลาง
- ตัวไฟล์ `NetAuto.exe` ไม่มีการเก็บรหัสผ่านหรือข้อมูลของใครไว้ สามารถแชร์ตัวโปรแกรมให้เพื่อนร่วมงานได้ปลอดภัย

---

## 7. อัปเดตเวอร์ชันและถอนการติดตั้ง

**การอัปเดต**
1. ปิดหน้าต่าง console สีดำของ NetAuto เดิม
2. ดาวน์โหลด `NetAuto.exe` เวอร์ชันใหม่จากหน้า [Releases: app-latest](https://github.com/Imgoingtosleep/deploy-config-38ghfa2n8ds/releases/tag/app-latest) มาแทนที่ไฟล์เดิม
3. ดับเบิลคลิกเปิดใช้งาน — ข้อมูลและการตั้งค่าทั้งหมดใน `%APPDATA%\NetAuto` จะยังคงอยู่ครบถ้วน

**การถอนการติดตั้ง**
1. ปิดโปรแกรมและลบไฟล์ `NetAuto.exe`
2. (หากต้องการลบข้อมูลการตั้งค่าและประวัติทั้งหมด) ลบโฟลเดอร์ `%APPDATA%\NetAuto`

---

## 8. แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ไข |
| :--- | :--- |
| Windows ขึ้น *"Windows protected your PC"* | กด **More info → Run anyway** (เนื่องจากโปรแกรมยังไม่ได้ซื้อใบรับรองดิจิทัล) |
| Antivirus กักหรือลบไฟล์ | เพิ่ม `NetAuto.exe` ใน Exception/Whitelist ของโปรแกรม Antivirus แล้วดาวน์โหลดใหม่ |
| เบราว์เซอร์ไม่เปิดขึ้นเอง | เปิดเว็บเบราว์เซอร์แล้วพิมพ์ URL ตามที่แสดงในหน้าต่าง Console (ค่าเริ่มต้นคือ `http://127.0.0.1:4050`) |
| ที่อยู่พอร์ตไม่ใช่ `:4050` | พอร์ต 4050 กำลังถูกโปรแกรมอื่นในเครื่องใช้งานอยู่ NetAuto จะสลับไปใช้พอร์ตว่างอื่นให้โดยอัตโนมัติ — ให้เปิด URL ตามที่ Console ระบุ |
| หน้าต่าง console ปิดตัวทันที | เปิด Command Prompt (cmd) แล้วพิมพ์รัน `NetAuto.exe` จากใน cmd เพื่อดูข้อความ Error |
| รายการอุปกรณ์ใน Fleet หายหลังรีเฟรช | หน้าเว็บไม่ได้บันทึก Fleet ลงดิสก์เพื่อความปลอดภัย — ให้ใช้ปุ่ม **Import** ดึงรายการจากไฟล์ Excel/CSV |
| **Auth Failed** | ตรวจสอบ username / password / enable secret และลำดับ priority ใน Credential Profile (ระวังบัญชีถูกล็อก) |
| **Unreachable / TCP Closed** | ตรวจสอบว่าเครื่องสามารถเชื่อมต่อพอร์ต 22 ของอุปกรณ์ได้หรือไม่ (ติด Firewall/VPN) ลองทดสอบด้วย PowerShell: `Test-NetConnection <ip> -Port 22` |
| Recursive LLDP เข้าเพื่อนบ้านไม่ได้ | ตรวจสอบในแท็บ Summary มักเกิดจากเพื่อนบ้านใช้บัญชีคนละชุด ให้เพิ่ม username/password เป็น Priority ถัดไปใน Credential Profile |
| Topology แสดงเป็น **Unknown model** | ใช้ฟังก์ชัน **Teach model** (ข้อ 5.5) สอนให้โปรแกรมรู้จักชื่อรุ่น หรือตรวจสอบว่า Command Profile มีคำสั่ง version ที่เหมาะสม |

**ต้องการเปลี่ยนพอร์ตเริ่มต้น:** สร้างไฟล์ `NetAuto.bat` ไว้ในโฟลเดอร์เดียวกับ `NetAuto.exe` แล้วเปิดโปรแกรมผ่านไฟล์นี้:
```bat
@echo off
set NETAUTO_PORT=5050
start "" "%~dp0NetAuto.exe"
```

---

## 9. อุปกรณ์และยี่ห้อที่รองรับ (Device Drivers)

| Driver (`device_type`) | ชื่อใน UI | Protocol | ตัวอย่างอุปกรณ์ที่รองรับ |
| :--- | :--- | :--- | :--- |
| `autodetect` | **Auto Detect (แนะนำ)** | SSH | ตรวจจับยี่ห้อและ Driver อัตโนมัติ |
| `huawei` | Huawei VRP | SSH 22 | CloudEngine, S-Series, AR, NE, USG |
| `huawei_telnet` | Huawei VRP (Telnet) | Telnet 23 | Huawei รุ่นเก่า |
| `cisco_ios` | Cisco IOS / IOS-XE | SSH 22 | Catalyst 2960/3850/9200/9300, ISR, ASR |
| `cisco_ios_telnet` | Cisco IOS (Telnet) | Telnet 23 | อุปกรณ์ Cisco เก่า / Lab |
| `cisco_nxos` | Cisco NX-OS | SSH 22 | Nexus 3000–9000 |
| `fortinet` | Fortinet FortiGate | SSH 22 | FortiGate ทุกรุ่น (FortiOS) |
| `raisecom_roap` | Raisecom ROS | SSH 22 | Raisecom Switch / Router |
| `aruba_os` | Aruba OS-CX / ProCurve | SSH 22 | Aruba CX 6100–8320, 2530, 2930 |
| `juniper_junos` | Juniper JunOS | SSH 22 | EX, QFX, SRX |
| `hp_comware` | HP / H3C Comware | SSH 22 | HPE FlexNetwork 5130/5510/5900, H3C |
| `mikrotik_routeros` | MikroTik RouterOS | SSH 22 | RouterBOARD, CRS, CCR |
| `linux` | Linux / Cumulus | SSH 22 | Ubuntu, Cumulus, SONiC, Generic Linux |

---

## 10. สำหรับผู้พัฒนา: build เอง

### 1) Build อัตโนมัติผ่าน GitHub Actions (แนะนำ)
เมื่อ push โค้ดขึ้น branch `download-application` ระบบ GitHub Actions จะทำการ build ไฟล์ `NetAuto.exe` บนเครื่อง Windows Server, รัน Smoke Test และอัปเดตไฟล์ใน [GitHub Release: app-latest](https://github.com/Imgoingtosleep/deploy-config-38ghfa2n8ds/releases/tag/app-latest) ให้อัตโนมัติ:

```bash
git checkout download-application
git merge main
git push origin download-application
```

### 2) Build เองบนเครื่อง Windows
สิ่งที่ต้องมีในเครื่อง:
- **Node.js** 18+ (สำหรับ build Web Frontend)
- **Python** 3.11+ (สำหรับ PyInstaller และ Backend)

เปิด PowerShell ในโฟลเดอร์โปรเจกต์แล้วรัน:
```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```
โปรแกรมจะสร้างไฟล์สำเร็จรูปอยู่ที่: `dist\NetAuto.exe`

| Environment Variable | หน้าที่ |
| :--- | :--- |
| `NETAUTO_PORT` | กำหนดพอร์ตเริ่มต้นที่ต้องการให้ Web UI และ API รัน (ค่าเริ่มต้น `4050`) |
| `NETAUTO_DATA_DIR` | ย้ายตำแหน่งโฟลเดอร์เก็บข้อมูลจาก `%APPDATA%\NetAuto` ไปยังตำแหน่งที่ต้องการ |

โครงสร้างโค้ดส่วน Packaging:
- [backend/run_app.py](file:///home/rachatacnx13/Desktop/Project/deploy-config/backend/run_app.py): สคริปต์เปิดโปรแกรม (Entry point) หาพอร์ตว่าง และเปิดเบราว์เซอร์
- [backend/app/core/paths.py](file:///home/rachatacnx13/Desktop/Project/deploy-config/backend/app/core/paths.py): จัดการพาธข้อมูลระหว่าง Source code ปกติ กับ `%APPDATA%` เมื่อแพ็กเป็น .exe
- [build.ps1](file:///home/rachatacnx13/Desktop/Project/deploy-config/build.ps1): สคริปต์ PowerShell สำหรับรัน build frontend + backend PyInstaller
- [frontend/.env.exe](file:///home/rachatacnx13/Desktop/Project/deploy-config/frontend/.env.exe): Environment file สำหรับ frontend mode exe (Same origin API)
- [.github/workflows/build-windows-exe.yml](file:///home/rachatacnx13/Desktop/Project/deploy-config/.github/workflows/build-windows-exe.yml): CI/CD Pipeline สร้างและปล่อย Release บน GitHub อัตโนมัติ
