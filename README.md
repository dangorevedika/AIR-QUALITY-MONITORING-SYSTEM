# AIR QUALITY SYSTEM – MQ-2 Environmental Monitoring System

An end-to-end IoT-based Gas, Smoke, and Air Quality Monitoring System built with **ESP8266 NodeMCU CP2102**, a **4-Pin MQ-2 Gas/Smoke Sensor**, **16×2 I2C LCD**, **Node.js/Express**, **JSON Database (`db.json`)**, and a responsive **Vibrant Multi-Color Tailwind CSS + Chart.js Pie Chart Dashboard with Animated Emojis**.

Developed by: **Vedika & Team**, Department of ETC, SB Jain, Nagpur.

---

## 📌 Project Overview

This project provides real-time atmospheric gas and smoke detection, remote hardware control, visual alerts, and historical data logging:

1. **Environmental Sensing**: The MQ-2 sensor reads combustible gas and smoke levels using both its **Analog Output (A0)** for relative concentration and **Digital Output (D0)** for fast threshold detection.
2. **Local Hardware Feedback**:
   - **16×2 I2C LCD**: Shows a rotating 5-screen monitoring sequence, device status, and custom remote text messages (`AIR QUALITY SYS`).
   - **LED (D3)**: Visual warning on elevated gas detection and manual toggle via the web dashboard.
   - **Buzzer (D4)**: Acoustic alarm triggered immediately upon dangerous smoke/gas conditions.
3. **Cloud & Local Synchronization**:
   - NodeMCU periodically sends sensor data to the server via HTTP POST every 10 seconds.
   - Server authenticates using a secure `DEVICE_KEY`.
   - NodeMCU receives updated LCD display text and actuator commands in the same response.
4. **Interactive Multi-Color Web Dashboard**:
   - **Vibrant Multi-Color Futuristic Palette**: Violet, Neon Cyan, Emerald, Amber, Fuchsia, and Coral glassmorphic glowing cards.
   - **Animated Emojis**: Dynamic animated emojis (🌿 clean air, ⛅ moderate, 😷 poor, 🚨 hazardous alarm) throughout metrics, table rows, and charts.
   - **24-Hour Air Quality Distribution Pie Chart**: Doughnut chart showing daily percentage breakdowns (Good, Moderate, Poor, Hazardous) and state transitions over 1 day.
   - **16×2 LCD Remote Controller**: Live blue/green backlit dot-matrix hardware simulator.
   - **LED & Buzzer Remote Controls**: Manual test triggers and auto-reset.
   - **Historical Records Table**: Latest-first, pagination, delete buttons, and **Asia/Kolkata (+05:30)** timestamps.
   - **Theme Engine**: Light and Dark modes with localStorage persistence.
   - **Secure Authentication**: Bcrypt-hashed password authentication.

---

## 🔌 Hardware Components & Wiring

### 1. Components
* **ESP8266 NodeMCU CP2102**
* **4-Pin MQ-2 Gas/Smoke Sensor Module** (VCC, GND, A0, D0)
* **16×2 I2C LCD Display** (I2C Address: `0x27`)
* **Red LED**
* **Active Buzzer**
* **220Ω Resistor** (for LED)
* **Breadboard & Jumper Wires**
* **Micro-USB Cable**

> **Note:** Only the MQ-2 sensor is used for environmental sensing. No DHT11 or temperature/humidity sensor is included or required.

---

### 2. Pin Connection Diagram

#### A. MQ-2 Gas/Smoke Sensor (4 Pins)
| MQ-2 Module Pin | ESP8266 NodeMCU Pin | Description |
| --------------- | ------------------- | ----------- |
| **VCC**         | **VIN (5V)**        | Power Supply (5V) |
| **GND**         | **GND**             | Ground |
| **A0**          | **A0**              | Variable Analog Gas/Smoke Reading |
| **D0**          | **D6 (GPIO12)**     | Digital Threshold Trigger |

* **Analog (A0):** Provides continuous analog readings (0–1023).
* **Digital (D0):** Triggers when gas/smoke level crosses the sensitivity threshold set by the blue potentiometer on the module.

#### B. 16×2 I2C LCD Display
| LCD Pin | ESP8266 NodeMCU Pin | Description |
| ------- | ------------------- | ----------- |
| **VCC** | **VIN (5V)**        | Power Supply (5V) |
| **GND** | **GND**             | Ground |
| **SDA** | **D2 (GPIO4)**      | I2C Data Line |
| **SCL** | **D1 (GPIO5)**      | I2C Clock Line |

* Default I2C Address: `0x27` (configurable in `MQ2_Air_Quality_Monitor.ino`).

#### C. Warning LED
```text
ESP8266 D3 (GPIO0)
    ↓
220Ω Resistor
    ↓
LED Anode (+)

LED Cathode (−)
    ↓
ESP8266 GND
```

#### D. Warning Buzzer
```text
ESP8266 D4 (GPIO2) → Buzzer (+)
ESP8266 GND        → Buzzer (−)
```

---

## 📟 LCD Display Sequences

### Startup Sequence
1. **Screen 1 (3 seconds):**
   ```text
   Simple IoT World
   VEDIKA & TEAM
   ```
2. **Screen 2:**
   ```text
   CONNECTING TO
   WiFi.........
   ```
3. **Screen 3 (Upon connection):**
   ```text
   CONNECTED TO
   WiFi...SUCCESS
   ```

### Continuous Monitoring Sequence (2 seconds per screen)
* **Screen 1:** `AIR QUALITY` / `<Analog Value> (Status)`
* **Screen 2:** `GAS/SMOKE` / `<Analog Value>`
* **Screen 3:** `DIGITAL STATUS` / `NORMAL` or `DETECTED`
* **Screen 4:** `SMART DISPLAY` / `<Saved Remote Text Line 1>`
* **Screen 5:** `LED STATUS` / `ON` or `OFF`
* **Emergency Alert (Gas Detected):** Overrides sequence with:
  ```text
  WARNING!
  GAS DETECTED
  ```

---

## 📊 Air Quality Classification

For demonstration purposes, the MQ-2 analog reading is categorized into 4 tiers:

| Raw Analog Range (A0) | Status | Color | Meaning |
| --------------------- | ------ | ----- | ------- |
| **0 – 100**           | **GOOD** | 🟢 Green | Clean ambient air |
| **101 – 200**         | **MODERATE** | 🟡 Yellow | Acceptable air condition |
| **201 – 300**         | **POOR** | 🟠 Orange | Moderate smoke or combustible gas |
| **301+**              | **VERY POOR** | 🔴 Red | High gas/smoke – Warning alert |

> **Disclaimer:** MQ-2 readings represent relative gas/smoke levels and depend on warm-up, calibration, ambient humidity, and gas type. They are demo indicators, not certified AQI measurements.

---

## 🗂️ Project Directory Structure

```text
Simple-IoT-World/
├── server.js                        # Express.js REST API server & session logic
├── package.json                     # Node.js dependencies & scripts
├── db.json                          # JSON database (users, records, device settings)
├── render.yaml                      # Render cloud deployment blueprint
├── .gitignore                       # Git ignore list
├── .env.example                     # Environment variables template
├── README.md                        # Documentation
├── public/
│   └── index.html                   # Responsive Tailwind CSS + Chart.js dashboard
└── ESP8266/
    └── MQ2_Air_Quality_Monitor.ino  # Complete ESP8266 firmware sketch
```

---

## 💻 Software & Server Setup

### 1. Prerequisites
- **Node.js**: v16+ installed ([Download Node.js](https://nodejs.org))
- **Arduino IDE**: 1.8.x or 2.x ([Download Arduino IDE](https://www.arduino.cc/en/software))

### 2. Local Server Installation
1. Open a terminal in the project directory:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
   Or for auto-reload during development:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```
4. **Default Login Credentials**:
   - **Email:** `vedika@example.com`
   - **Password:** `vedika123`
   *(You can also register a new account on the registration tab).*

---

## ☁️ Render Deployment Guide

1. Push your repository to **GitHub**.
2. Log in to [Render](https://render.com).
3. Click **New +** → **Blueprint** and connect your GitHub repository (it will automatically detect [`render.yaml`](file:///c:/Users/hp/Desktop/AIR%20QUALITY%20MONITORING%20SYSTEM/render.yaml)).
   * Alternatively, select **Web Service**:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Environment Variables**:
       - `DEVICE_KEY`: `VEDIKA_MQ2_SECURE_KEY_2026`
       - `SESSION_SECRET`: `your_random_secure_session_secret`
       - `PORT`: `10000`
4. Once deployed, Render will provide a live HTTPS URL (e.g. `https://simple-iot-world-air-quality.onrender.com`).
5. Paste this URL into your ESP8266 sketch:
   ```cpp
   const char* serverURL = "https://simple-iot-world-air-quality.onrender.com";
   ```

---

## 🛠️ ESP8266 NodeMCU Firmware Flashing

1. In Arduino IDE, install the ESP8266 Board package:
   - **File** → **Preferences** → **Additional Boards Manager URLs**:
     ```text
     http://arduino.esp8266.com/stable/package_esp8266com_index.json
     ```
   - **Tools** → **Board** → **Boards Manager** → Search for `esp8266` by ESP8266 Community and click **Install**.
2. Install Required Libraries via **Library Manager**:
   - `LiquidCrystal_I2C` by Frank de Brabander
   - `ArduinoJson` (v6 or v7) by Benoît Blanchon
3. Open [`ESP8266/MQ2_Air_Quality_Monitor.ino`](file:///c:/Users/hp/Desktop/AIR%20QUALITY%20MONITORING%20SYSTEM/ESP8266/MQ2_Air_Quality_Monitor.ino).
4. Configure Wi-Fi & Server:
   ```cpp
   const char* ssid     = "ESP8266";      // Your Wi-Fi network SSID
   const char* password = "12345678";     // Your Wi-Fi network Password
   const char* serverURL = "https://your-render-app.onrender.com"; // Your server URL
   ```
5. Select:
   - **Board:** NodeMCU 1.0 (ESP-12E Module)
   - **Port:** Your NodeMCU COM port
6. Click **Upload**. Open **Serial Monitor** at **115200 baud** to view real-time diagnostics.

---

## 📡 REST API Reference

### 1. Authentication
* `POST /register`: Registers a new user `{ name, email, password }`
* `POST /login`: Authenticates user `{ email, password }`
* `GET /logout`: Ends session
* `GET /api/me`: Returns active user profile

### 2. Sensor Data & Ingestion
* `POST /api/sensor-data`: NodeMCU endpoint to submit readings:
  ```json
  {
    "deviceKey": "VEDIKA_MQ2_SECURE_KEY_2026",
    "a0": 245,
    "d0": "NORMAL"
  }
  ```
  *Response includes current LCD lines and LED status.*
* `GET /api/latest-data`: Returns latest sensor reading, online state, and actuator settings.
* `GET /api/records?page=1&limit=10`: Returns paginated historical sensor records in Asia/Kolkata timezone.
* `DELETE /api/records/:id`: Deletes a specific historical record.

### 3. Remote Actuators & Display
* `GET /api/lcd`: Gets current LCD lines.
* `POST /api/lcd`: Updates LCD Line 1 & Line 2 (`{ line1, line2 }` max 16 chars).
* `GET /api/led`: Gets current LED status.
* `POST /api/led`: Toggles LED (`{ status: "ON" | "OFF" }`).
* `GET /api/buzzer`: Gets buzzer status.
* `POST /api/buzzer`: Configures buzzer (`{ status: "ON" | "OFF", mode: "AUTO" | "MANUAL" }`).
* `GET /api/device-status`: Returns NodeMCU heartbeat and online/offline status.

---

## 🧪 Testing Checklist

- [x] **Wi-Fi Connection**: ESP8266 connects to Wi-Fi and shows IP address in Serial Monitor.
- [x] **MQ-2 Analog & Digital Sensing**: A0 value responds to smoke/gas and D0 triggers threshold.
- [x] **Hardware Warning System**: High gas automatically activates Buzzer (D4) and LED (D3).
- [x] **16×2 LCD Sequence**: Cycles startup screens and 5-screen monitoring sequence every 2s.
- [x] **Web Dashboard**: Displays live gauge, air quality tier, and dynamic Chart.js graph.
- [x] **Remote LCD Editor**: Changing Line 1 & 2 updates the simulated LCD and physical 16×2 LCD.
- [x] **Remote LED Control**: LED ON and LED OFF buttons control hardware LED remotely.
- [x] **Historical Records**: Logged in `db.json` with Asia/Kolkata (+05:30) timestamps, paginated and deletable.
- [x] **Theme Persistence**: Light and Dark modes switch smoothly and save in localStorage.
- [x] **Render Compatibility**: Ready for zero-config deployment using `render.yaml`.

---

## 📜 Footer & Credits

**“Developed with ❤️ by Vedika & Team. Department of ETC, SB Jain, Nagpur”**
