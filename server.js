const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'simple_iot_world_secret_key_vedika_team_2026';
const DEVICE_KEY = process.env.DEVICE_KEY || 'VEDIKA_MQ2_SECURE_KEY_2026';
const DB_FILE = path.join(__dirname, 'db.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    secure: false // allow http in dev, Render handles https proxy
  }
}));

// Helper functions for JSON database
function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialDb = {
        users: [],
        records: [],
        deviceSettings: {
          lcdLine1: "VEDIKA & TEAM",
          lcdLine2: "AIR MONITORING",
          ledStatus: "OFF",
          buzzerStatus: "OFF",
          buzzerMode: "AUTO",
          lastSeen: null
        }
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
      return initialDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database:", err);
    return { users: [], records: [], deviceSettings: { lcdLine1: "VEDIKA & TEAM", lcdLine2: "AIR MONITORING", ledStatus: "OFF", buzzerStatus: "OFF", buzzerMode: "AUTO", lastSeen: null } };
  }
}

function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error("Error writing database:", err);
    return false;
  }
}

// Format date and time in Asia/Kolkata (+05:30) timezone
function getKolkataDateTime(dateObj = new Date()) {
  const optionsDate = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' };
  const optionsTime = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
  
  const date = dateObj.toLocaleDateString('en-GB', optionsDate); // DD/MM/YYYY
  const time = dateObj.toLocaleTimeString('en-US', optionsTime); // HH:MM:SS AM/PM
  return { date, time };
}

// Calculate Air Quality Status from MQ-2 Analog value
function getAirQualityStatus(a0) {
  const val = Number(a0);
  if (val <= 100) return 'GOOD';
  if (val <= 200) return 'MODERATE';
  if (val <= 300) return 'POOR';
  return 'VERY POOR';
}

// Middleware to protect routes that require authentication
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// Verify Device Key for ESP8266 or device control
function verifyDeviceKey(req) {
  const providedKey = req.headers['x-device-key'] || req.body.deviceKey || req.query.deviceKey;
  return providedKey === DEVICE_KEY;
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Register
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields (name, email, password) are required.' });
  }

  const db = readDatabase();
  const existingUser = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: 'user_' + Date.now(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    writeDatabase(db);

    // Auto login
    req.session.user = { id: newUser.id, name: newUser.name, email: newUser.email };
    res.json({ success: true, message: 'Registration successful!', user: req.session.user });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const db = readDatabase();
  const user = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  try {
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.user = { id: user.id, name: user.name, email: user.email };
    res.json({ success: true, message: 'Login successful!', user: req.session.user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Logout
app.all(['/logout', '/api/logout'], (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// Current User Info
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  return res.json({ authenticated: false, user: null });
});

// ==========================================
// 2. SENSOR DATA & DEVICE STATUS
// ==========================================

// ESP8266 Sensor Data Ingestion
// Accepts { a0, d0, deviceKey } or header 'x-device-key'
app.post('/api/sensor-data', (req, res) => {
  if (!verifyDeviceKey(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing Device Key' });
  }

  const a0 = Number(req.body.a0);
  if (isNaN(a0)) {
    return res.status(400).json({ error: 'Invalid analog reading (a0 must be a number)' });
  }

  // d0 can be passed as 'DETECTED', 'NORMAL', 0, 1, true, false
  let d0Status = 'NORMAL';
  if (typeof req.body.d0 === 'string') {
    d0Status = req.body.d0.toUpperCase().includes('DETECT') ? 'DETECTED' : 'NORMAL';
  } else if (typeof req.body.d0 === 'number') {
    // If raw digital pin reading where 0 (LOW) indicates detection
    d0Status = req.body.d0 === 0 ? 'DETECTED' : 'NORMAL';
  } else if (typeof req.body.d0 === 'boolean') {
    d0Status = req.body.d0 ? 'DETECTED' : 'NORMAL';
  }

  const airQualityStatus = getAirQualityStatus(a0);
  const now = new Date();
  const { date, time } = getKolkataDateTime(now);

  const isWarning = d0Status === 'DETECTED' || airQualityStatus === 'VERY POOR';

  const db = readDatabase();
  const newRecord = {
    id: db.records.length > 0 ? (Math.max(...db.records.map(r => r.id || 0)) + 1) : 1,
    a0: a0,
    d0: d0Status,
    status: airQualityStatus,
    timestamp: now.getTime(),
    date: date,
    time: time
  };

  db.records.push(newRecord);

  // Keep last 500 records to prevent memory/disk bloat
  if (db.records.length > 500) {
    db.records = db.records.slice(-500);
  }

  // Update device heartbeat and auto buzzer/led status
  db.deviceSettings.lastSeen = now.getTime();

  if (isWarning) {
    // Dangerous gas/smoke detected:
    // Turn LED ON and Buzzer ON
    db.deviceSettings.ledStatus = 'ON';
    db.deviceSettings.buzzerStatus = 'ON';
  } else {
    // If buzzer is in AUTO mode, turn off buzzer
    if (db.deviceSettings.buzzerMode !== 'MANUAL') {
      db.deviceSettings.buzzerStatus = 'OFF';
    }
  }

  writeDatabase(db);

  // Send back current device instructions in response to save network roundtrips for ESP8266
  res.json({
    success: true,
    message: 'Sensor data recorded',
    record: newRecord,
    settings: {
      lcdLine1: db.deviceSettings.lcdLine1 || "AIR QUALITY SYS",
      lcdLine2: db.deviceSettings.lcdLine2 || "VEDIKA & TEAM",
      ledStatus: db.deviceSettings.ledStatus,
      buzzerStatus: db.deviceSettings.buzzerStatus,
      isWarning: isWarning
    }
  });
});

// Latest Sensor Data & Device Status
app.get('/api/latest-data', (req, res) => {
  const db = readDatabase();
  const latest = db.records.length > 0 ? db.records[db.records.length - 1] : null;
  const now = Date.now();
  const lastSeen = db.deviceSettings.lastSeen || 0;
  // ESP sends every 10s. Mark offline if no ping in 35s.
  const isOnline = (now - lastSeen) < 35000;

  res.json({
    latest: latest,
    online: isOnline,
    lastSeen: lastSeen,
    secondsAgo: lastSeen ? Math.round((now - lastSeen) / 1000) : null,
    deviceSettings: db.deviceSettings
  });
});

// Paginated Records
app.get('/api/records', (req, res) => {
  const db = readDatabase();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  // Newest records first
  const sortedRecords = [...db.records].reverse();
  const totalRecords = sortedRecords.length;
  const totalPages = Math.ceil(totalRecords / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedRecords = sortedRecords.slice(startIndex, startIndex + limit);

  res.json({
    records: paginatedRecords,
    totalRecords: totalRecords,
    currentPage: page,
    totalPages: totalPages
  });
});

// Delete Record
app.delete('/api/records/:id', (req, res) => {
  const idToDelete = Number(req.params.id);
  const db = readDatabase();
  const initialLength = db.records.length;
  db.records = db.records.filter(r => r.id !== idToDelete);

  if (db.records.length === initialLength) {
    return res.status(404).json({ error: 'Record not found' });
  }

  writeDatabase(db);
  res.json({ success: true, message: `Record #${idToDelete} deleted successfully` });
});

// ==========================================
// 3. LCD CONTROL
// ==========================================

app.get('/api/lcd', (req, res) => {
  const db = readDatabase();
  res.json({
    line1: db.deviceSettings.lcdLine1 || "AIR QUALITY SYS",
    line2: db.deviceSettings.lcdLine2 || "VEDIKA & TEAM"
  });
});

app.post('/api/lcd', (req, res) => {
  const { line1, line2 } = req.body;
  const db = readDatabase();

  if (line1 !== undefined) {
    db.deviceSettings.lcdLine1 = String(line1).substring(0, 16);
  }
  if (line2 !== undefined) {
    db.deviceSettings.lcdLine2 = String(line2).substring(0, 16);
  }

  writeDatabase(db);
  res.json({
    success: true,
    message: 'LCD text updated successfully',
    lcd: {
      line1: db.deviceSettings.lcdLine1,
      line2: db.deviceSettings.lcdLine2
    }
  });
});

// ==========================================
// 4. LED CONTROL
// ==========================================

app.get('/api/led', (req, res) => {
  const db = readDatabase();
  res.json({
    status: db.deviceSettings.ledStatus || 'OFF'
  });
});

app.post('/api/led', (req, res) => {
  const { status } = req.body;
  if (!status || !['ON', 'OFF'].includes(status.toUpperCase())) {
    return res.status(400).json({ error: 'Status must be either "ON" or "OFF"' });
  }

  const db = readDatabase();
  db.deviceSettings.ledStatus = status.toUpperCase();
  writeDatabase(db);

  res.json({
    success: true,
    message: `LED turned ${db.deviceSettings.ledStatus}`,
    status: db.deviceSettings.ledStatus,
    ledStatus: db.deviceSettings.ledStatus
  });
});

// ==========================================
// 5. BUZZER CONTROL
// ==========================================

app.get('/api/buzzer', (req, res) => {
  const db = readDatabase();
  res.json({
    status: db.deviceSettings.buzzerStatus || 'OFF',
    buzzerStatus: db.deviceSettings.buzzerStatus || 'OFF',
    mode: db.deviceSettings.buzzerMode || 'AUTO'
  });
});

app.post('/api/buzzer', (req, res) => {
  const { status, mode } = req.body;
  const db = readDatabase();

  if (status && ['ON', 'OFF'].includes(status.toUpperCase())) {
    db.deviceSettings.buzzerStatus = status.toUpperCase();
  }
  if (mode && ['AUTO', 'MANUAL'].includes(mode.toUpperCase())) {
    db.deviceSettings.buzzerMode = mode.toUpperCase();
  }

  writeDatabase(db);
  res.json({
    success: true,
    message: `Buzzer updated`,
    status: db.deviceSettings.buzzerStatus,
    buzzerStatus: db.deviceSettings.buzzerStatus,
    mode: db.deviceSettings.buzzerMode
  });
});

// ==========================================
// 6. DEVICE STATUS
// ==========================================

app.get('/api/device-status', (req, res) => {
  const db = readDatabase();
  const now = Date.now();
  const lastSeen = db.deviceSettings.lastSeen || 0;
  const isOnline = (now - lastSeen) < 35000;

  res.json({
    online: isOnline,
    lastSeen: lastSeen,
    secondsAgo: lastSeen ? Math.round((now - lastSeen) / 1000) : null
  });
});

// ==========================================
// 7. SIMULATION HELPER (Quick Testing & Demo)
// ==========================================

app.post('/api/simulate-data', (req, res) => {
  const db = readDatabase();
  const now = new Date();
  const { date, time } = getKolkataDateTime(now);

  // Use provided value or generate realistic fluctuating value
  let a0 = req.body.a0 !== undefined ? Number(req.body.a0) : Math.floor(Math.random() * 280) + 40;
  let d0 = req.body.d0 !== undefined ? req.body.d0 : (a0 > 300 ? 'DETECTED' : 'NORMAL');
  
  const status = getAirQualityStatus(a0);
  const isWarning = d0 === 'DETECTED' || status === 'VERY POOR';

  const newRecord = {
    id: db.records.length > 0 ? (Math.max(...db.records.map(r => r.id || 0)) + 1) : 1,
    a0: a0,
    d0: d0,
    status: status,
    timestamp: now.getTime(),
    date: date,
    time: time
  };

  db.records.push(newRecord);
  if (db.records.length > 500) db.records = db.records.slice(-500);

  db.deviceSettings.lastSeen = now.getTime();
  if (isWarning) {
    db.deviceSettings.ledStatus = 'ON';
    db.deviceSettings.buzzerStatus = 'ON';
  } else if (db.deviceSettings.buzzerMode !== 'MANUAL') {
    db.deviceSettings.buzzerStatus = 'OFF';
  }

  writeDatabase(db);
  res.json({ success: true, record: newRecord });
});

// ==========================================
// 8. DAILY 24-HOUR STATS & PIE CHART DATA
// ==========================================

app.get('/api/daily-stats', (req, res) => {
  const db = readDatabase();
  const { date: todayKolkata } = getKolkataDateTime(new Date());

  // Filter records from today or last 24 hours
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  let dailyRecords = db.records.filter(r => r.timestamp >= oneDayAgo || r.date === todayKolkata);
  
  if (dailyRecords.length === 0 && db.records.length > 0) {
    dailyRecords = db.records.slice(-100);
  }

  const counts = {
    GOOD: 0,
    MODERATE: 0,
    POOR: 0,
    VERY_POOR: 0
  };

  let stateChanges = 0;
  let lastStatus = null;
  let maxA0 = 0;
  let minA0 = 1024;
  let sumA0 = 0;

  dailyRecords.forEach(r => {
    const rawStatus = (r.status || 'GOOD').toUpperCase();
    const st = rawStatus === 'VERY POOR' ? 'VERY_POOR' : rawStatus;
    if (counts[st] !== undefined) {
      counts[st]++;
    } else {
      counts.GOOD++;
    }

    if (lastStatus && lastStatus !== r.status) {
      stateChanges++;
    }
    lastStatus = r.status;

    const val = Number(r.a0) || 0;
    if (val > maxA0) maxA0 = val;
    if (val < minA0) minA0 = val;
    sumA0 += val;
  });

  const total = dailyRecords.length || 1;
  const goodPct = Math.round((counts.GOOD / total) * 100);
  const modPct = Math.round((counts.MODERATE / total) * 100);
  const poorPct = Math.round((counts.POOR / total) * 100);
  const vpoorPct = Math.max(0, 100 - (goodPct + modPct + poorPct));

  // Determine dominant mood/status of the day
  let dominant = 'GOOD';
  let maxCount = counts.GOOD;
  if (counts.MODERATE > maxCount) { dominant = 'MODERATE'; maxCount = counts.MODERATE; }
  if (counts.POOR > maxCount) { dominant = 'POOR'; maxCount = counts.POOR; }
  if (counts.VERY_POOR > maxCount) { dominant = 'VERY POOR'; maxCount = counts.VERY_POOR; }

  res.json({
    date: todayKolkata,
    totalRecords: dailyRecords.length,
    stateChanges: stateChanges,
    dominantStatus: dominant,
    distribution: {
      good: counts.GOOD,
      moderate: counts.MODERATE,
      poor: counts.POOR,
      veryPoor: counts.VERY_POOR
    },
    percentages: {
      good: goodPct,
      moderate: modPct,
      poor: poorPct,
      veryPoor: vpoorPct
    },
    metrics: {
      avgA0: dailyRecords.length ? Math.round(sumA0 / dailyRecords.length) : 0,
      maxA0: dailyRecords.length && maxA0 > 0 ? maxA0 : 0,
      minA0: dailyRecords.length && minA0 < 1024 ? minA0 : 0
    }
  });
});

// Serve frontend for all standard page requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 AIR QUALITY SYSTEM - Environmental Server`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔑 Device Key: ${DEVICE_KEY}`);
  console.log(`⏰ Timezone: Asia/Kolkata (+05:30)`);
  console.log(`====================================================`);
});
