/*
 * ==============================================================================
 * Project: AIR QUALITY SYSTEM – MQ-2 Air Quality Monitoring System
 * Developed by: Vedika & Team (Department of ETC, SB Jain, Nagpur)
 * 
 * Hardware:
 *   - ESP8266 NodeMCU CP2102
 *   - 4-Pin MQ-2 Gas/Smoke Sensor Module (VCC, GND, A0, D0)
 *   - 16x2 I2C LCD Display (Address 0x27)
 *   - Warning LED (Connected to D3 via 220 Ohm resistor)
 *   - Warning Buzzer (Connected to D4)
 * 
 * Pin Connections:
 *   - MQ-2 VCC     -> NodeMCU VIN / 5V
 *   - MQ-2 GND     -> NodeMCU GND
 *   - MQ-2 A0      -> NodeMCU A0 (Analog Gas/Smoke Level)
 *   - MQ-2 D0      -> NodeMCU D6 (GPIO12) (Digital Threshold Trigger)
 *   - LCD SDA      -> NodeMCU D2 (GPIO4)
 *   - LCD SCL      -> NodeMCU D1 (GPIO5)
 *   - LED (+)      -> NodeMCU D3 (GPIO0) via 220 Ohm resistor
 *   - Buzzer (+)   -> NodeMCU D4 (GPIO2)
 *   - LED/Buzzer(-)-> NodeMCU GND
 * 
 * Important Note on MQ-2:
 *   MQ-2 is primarily a gas and smoke sensor. Raw analog readings represent relative
 *   gas/smoke concentrations and are used for demo air quality grading (not certified AQI).
 * ==============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ---------------------- PIN DEFINITIONS ----------------------
const int MQ2_ANALOG_PIN  = A0;    // MQ-2 A0 pin
const int MQ2_DIGITAL_PIN = 12;    // MQ-2 D0 -> NodeMCU D6 (GPIO12)
const int LED_PIN          = 0;     // LED -> NodeMCU D3 (GPIO0)
const int BUZZER_PIN       = 2;     // Buzzer -> NodeMCU D4 (GPIO2)

// ---------------------- LCD CONFIGURATION --------------------
// Set the LCD I2C address (default is 0x27, change to 0x3F if your module uses it)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------------------- WI-FI CONFIGURATION ------------------
const char* ssid     = "ESP8266";
const char* password = "12345678";

// ---------------------- SERVER & AUTH CONFIG -----------------
// Keep blank initially. After deploying to Render or running locally, enter your URL:
// Example Local: "http://192.168.1.100:3000"
// Example Render: "https://simple-iot-world-air-quality.onrender.com"
const char* serverURL = "";

// Device authentication key matching backend environment variable
const char* deviceKey = "VEDIKA_MQ2_SECURE_KEY_2026";

// ---------------------- RUNTIME VARIABLES --------------------
int mq2AnalogValue = 0;
int mq2DigitalRaw  = HIGH;
String digitalStatus = "NORMAL";
String airQualityStatus = "GOOD";
bool isGasWarning = false;

// Remote LCD and device controls fetched from server
String smartLcdLine1 = "AIR QUALITY SYS";
String smartLcdLine2 = "VEDIKA & TEAM";
String serverLedState = "OFF";

// Timing variables
unsigned long lastServerUpdate = 0;
const unsigned long SERVER_INTERVAL = 10000; // 10 seconds

unsigned long lastLcdScreenChange = 0;
const unsigned long LCD_SCREEN_INTERVAL = 2000; // 2 seconds per screen
int currentLcdScreen = 1;

// Function Declarations
void connectToWiFi();
void readSensors();
void sendDataToServer();
void updateOutputs();
void updateLcdDisplay();
String getAirQualityGrade(int analogVal);

// =============================================================
// SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n--- AIR QUALITY SYSTEM: Environmental Monitoring ---");
  Serial.println("Developed with <3 by Vedika & Team (SB Jain, Nagpur)");

  // Pin Modes
  pinMode(MQ2_DIGITAL_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize I2C for LCD on D2 (SDA) and D1 (SCL)
  Wire.begin(4, 5); // SDA = GPIO4 (D2), SCL = GPIO5 (D1)
  lcd.init();
  lcd.backlight();
  lcd.clear();

  // 17. LCD Startup Display: Screen 1
  lcd.setCursor(0, 0);
  lcd.print("AIR QUALITY SYS ");
  lcd.setCursor(0, 1);
  lcd.print("VEDIKA & TEAM   ");
  delay(3000); // Wait 3 seconds

  // Connect to Wi-Fi with LCD Status
  connectToWiFi();

  // Initial sensor read
  readSensors();
  lastServerUpdate = millis() - SERVER_INTERVAL + 2000; // Send initial data shortly
}

// =============================================================
// MAIN LOOP
// =============================================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Maintain Wi-Fi Connection
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  // 2. Read Sensors continuously
  readSensors();

  // 3. Update Hardware Outputs (LED & Buzzer)
  updateOutputs();

  // 4. Update LCD Display sequence every 2 seconds
  if (currentMillis - lastLcdScreenChange >= LCD_SCREEN_INTERVAL) {
    lastLcdScreenChange = currentMillis;
    updateLcdDisplay();
    currentLcdScreen++;
    if (currentLcdScreen > 5) {
      currentLcdScreen = 1;
    }
  }

  // 5. Send data to Server every 10 seconds
  if (currentMillis - lastServerUpdate >= SERVER_INTERVAL) {
    lastServerUpdate = currentMillis;
    if (strlen(serverURL) > 0) {
      sendDataToServer();
    } else {
      Serial.println("[INFO] serverURL is empty. Set your Render/local server URL in code to sync data.");
    }
  }

  delay(50); // Small loop pacing
}

// =============================================================
// WI-FI CONNECTION HELPER
// =============================================================
void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CONNECTING TO   ");
  lcd.setCursor(0, 1);
  lcd.print("WiFi.........   ");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected successfully!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("CONNECTED TO    ");
    lcd.setCursor(0, 1);
    lcd.print("WiFi...SUCCESS  ");
    delay(2000);
  } else {
    Serial.println("\nWiFi Connection failed. Running in standalone sensing mode.");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi CONNECT    ");
    lcd.setCursor(0, 1);
    lcd.print("FAILED / RETRY  ");
    delay(1500);
  }
}

// =============================================================
// SENSOR READING & STATUS EVALUATION
// =============================================================
void readSensors() {
  // Read A0 analog level (0 - 1023)
  mq2AnalogValue = analogRead(MQ2_ANALOG_PIN);

  // Read D0 digital threshold output
  // On most standard MQ-2 modules, comparator outputs LOW when threshold is crossed
  mq2DigitalRaw = digitalRead(MQ2_DIGITAL_PIN);
  bool thresholdCrossed = (mq2DigitalRaw == LOW);

  digitalStatus = thresholdCrossed ? "DETECTED" : "NORMAL";
  airQualityStatus = getAirQualityGrade(mq2AnalogValue);

  // Warning trigger: D0 detected or analog level in VERY POOR (301+)
  isGasWarning = thresholdCrossed || (mq2AnalogValue > 300);
}

// Map MQ-2 reading to air quality classification
String getAirQualityGrade(int val) {
  if (val <= 100) return "GOOD";
  if (val <= 200) return "MODERATE";
  if (val <= 300) return "POOR";
  return "VERY POOR";
}

// =============================================================
// HARDWARE OUTPUT CONTROL (LED & BUZZER)
// =============================================================
void updateOutputs() {
  if (isGasWarning) {
    // Dangerous gas/smoke detected:
    // LED ON and Buzzer ON
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    // Normal state:
    // Buzzer OFF
    digitalWrite(BUZZER_PIN, LOW);

    // LED follows remote dashboard command
    if (serverLedState == "ON") {
      digitalWrite(LED_PIN, HIGH);
    } else {
      digitalWrite(LED_PIN, LOW);
    }
  }
}

// =============================================================
// 18. LCD MONITORING SEQUENCE (2s per screen)
// =============================================================
void updateLcdDisplay() {
  // If dangerous gas detected, override sequence to show immediate warning
  if (isGasWarning) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WARNING!        ");
    lcd.setCursor(0, 1);
    lcd.print("GAS DETECTED    ");
    return;
  }

  lcd.clear();
  switch (currentLcdScreen) {
    case 1:
      // Screen 1: AIR QUALITY / Value
      lcd.setCursor(0, 0);
      lcd.print("AIR QUALITY     ");
      lcd.setCursor(0, 1);
      lcd.print(mq2AnalogValue);
      lcd.print(" (");
      lcd.print(airQualityStatus);
      lcd.print(")");
      break;

    case 2:
      // Screen 2: GAS/SMOKE / Value
      lcd.setCursor(0, 0);
      lcd.print("GAS/SMOKE       ");
      lcd.setCursor(0, 1);
      lcd.print(mq2AnalogValue);
      break;

    case 3:
      // Screen 3: DIGITAL STATUS / Status
      lcd.setCursor(0, 0);
      lcd.print("DIGITAL STATUS  ");
      lcd.setCursor(0, 1);
      lcd.print(digitalStatus);
      break;

    case 4:
      // Screen 4: SMART DISPLAY / Remote Line 1 text
      lcd.setCursor(0, 0);
      lcd.print("SMART DISPLAY   ");
      lcd.setCursor(0, 1);
      if (smartLcdLine1.length() > 0) {
        lcd.print(smartLcdLine1.substring(0, 16));
      } else {
        lcd.print("MyData          ");
      }
      break;

    case 5:
      // Screen 5: LED STATUS / ON or OFF
      lcd.setCursor(0, 0);
      lcd.print("LED STATUS      ");
      lcd.setCursor(0, 1);
      lcd.print(digitalRead(LED_PIN) == HIGH ? "ON" : "OFF");
      break;

    default:
      currentLcdScreen = 1;
      break;
  }
}

// =============================================================
// 19. HTTP DATA COMMUNICATION (ESP8266 <-> Node.js Server)
// =============================================================
void sendDataToServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Wi-Fi not connected. Skipping server sync.");
    return;
  }

  String endpoint = String(serverURL) + "/api/sensor-data";
  Serial.print("[HTTP] Posting data to: ");
  Serial.println(endpoint);

  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  HTTPClient http;

  bool isHttps = endpoint.startsWith("https://");
  if (isHttps) {
    secureClient.setInsecure(); // Allows HTTPS without certificate bundle
    http.begin(secureClient, endpoint);
  } else {
    http.begin(plainClient, endpoint);
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", deviceKey);

  // Construct JSON payload
  StaticJsonDocument<256> doc;
  doc["deviceKey"] = deviceKey;
  doc["a0"] = mq2AnalogValue;
  doc["d0"] = digitalStatus;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  int httpCode = http.POST(jsonPayload);

  if (httpCode > 0) {
    Serial.printf("[HTTP] POST Result Code: %d\n", httpCode);
    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      String response = http.getString();
      Serial.println("[HTTP] Response: " + response);

      // Parse response to update remote LCD and LED commands
      StaticJsonDocument<512> resDoc;
      DeserializationError error = deserializeJson(resDoc, response);
      if (!error && resDoc["settings"].is<JsonObject>()) {
        JsonObject settings = resDoc["settings"];
        if (settings.containsKey("lcdLine1")) {
          smartLcdLine1 = settings["lcdLine1"].as<String>();
        }
        if (settings.containsKey("lcdLine2")) {
          smartLcdLine2 = settings["lcdLine2"].as<String>();
        }
        if (settings.containsKey("ledStatus")) {
          serverLedState = settings["ledStatus"].as<String>();
        }
      }
    }
  } else {
    Serial.printf("[HTTP] POST failed, error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}
