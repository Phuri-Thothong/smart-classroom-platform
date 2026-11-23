#ifndef SMART_CLASS_NODE_CORE_H
#define SMART_CLASS_NODE_CORE_H

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Preferences.h>
#if __has_include(<esp_idf_version.h>)
  #include <esp_idf_version.h>
#endif
#include "SmartClassProtocol.h"

typedef void (*TelemetryFillCallback)(TelemetryPacket& pkt);
typedef void (*CommandCallback)(uint8_t commandCode);

class SmartClassNodeCore {
public:
  void begin(
    const char* idPrefix,
    const char* deviceType,
    const char* firmwareVersion,
    uint8_t defaultPin1 = 32,
    uint8_t defaultPin2 = 255,
    uint8_t defaultPin3 = 255,
    uint8_t defaultPin4 = 255
  ) {
    instance() = this;
    _deviceType = deviceType;
    _firmwareVersion = firmwareVersion;

    // 1. ตรวจสอบปุ่ม BOOT (GPIO 0) ตอนเปิดเครื่องเพื่อล้างค่า NVS
    pinMode(0, INPUT_PULLUP);
    delay(100);
    if (digitalRead(0) == LOW) {
      Serial.println("\n[Core] BOOT button held -> Clearing NVS (smartclass)...");
      _prefs.begin("smartclass", false);
      _prefs.clear();
      _prefs.end();
      delay(1000);
    }

    // 2. โหลดค่าที่บันทึกไว้ใน NVS
    _prefs.begin("smartclass", true);
    _isConfigured      = _prefs.getBool("is_configured", false);
    _samplingInterval  = _prefs.getInt("spl_interval", 5);
    _telemetryInterval = _prefs.getInt("tel_interval", 300);
    int savedChannel   = _prefs.getInt("channel", 0);

    _pin1 = _prefs.getInt("pin_1", defaultPin1);
    _pin2 = _prefs.getInt("pin_2", defaultPin2);
    _pin3 = _prefs.getInt("pin_3", defaultPin3);
    _pin4 = _prefs.getInt("pin_4", defaultPin4);
    _prefs.end();

    // 3. เปิด Wi-Fi STA ก่อนอ่าน MAC Address เพื่อสร้าง Unique ID
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[7];
    sprintf(macStr, "%02X%02X%02X", mac[3], mac[4], mac[5]);
    _deviceId = String(idPrefix) + macStr;

    // 4. ตั้งช่องสัญญาณเริ่มต้น (บังคับยืนยัน ACK เสมอตอนบูต)
    esp_wifi_set_promiscuous(true);
    if (savedChannel > 0 && savedChannel <= 13) {
      _currentChannel = savedChannel;
      Serial.println("[Core] BOOT: Verifying saved Channel " + String(_currentChannel) + "...");
    } else {
      _currentChannel = 1;
    }
    _isChannelLocked = false;
    esp_wifi_set_channel(_currentChannel, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    // 5. เริ่มต้น ESP-NOW
    if (esp_now_init() != ESP_OK) {
      Serial.println("[Core] Error initializing ESP-NOW!");
      return;
    }
    esp_now_register_recv_cb(_onDataRecv);
    esp_now_register_send_cb(_onDataSent);

    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, _broadcastAddress, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);

    _nextJitterMs = random(100, 1500);
    sendMetadata();
    _lastScanHopTime = millis();
  }

  void loop() {
    unsigned long now = millis();

    // จัดการคำสั่ง Factory Reset หรือ Config Reboot นอก Callback เพื่อความปลอดภัย
    if (_pendingFactoryReset) {
      _pendingFactoryReset = false;
      Serial.println("[Core] Executing Factory Reset...");
      _prefs.begin("smartclass", false);
      _prefs.clear();
      _prefs.end();
      delay(500);
      ESP.restart();
    }

    if (_pendingConfigApply) {
      _pendingConfigApply = false;
      _savePendingConfig();
      Serial.println("[Core] Configuration saved! Rebooting...");
      delay(500);
      ESP.restart();
    }

    // 1. กวาดหาช่องสัญญาณ Gateway
    if (!_isChannelLocked) {
      if (now - _lastScanHopTime >= SCAN_HOP_INTERVAL) {
        _currentChannel++;
        if (_currentChannel > 13) _currentChannel = 1;
        esp_wifi_set_channel(_currentChannel, WIFI_SECOND_CHAN_NONE);

        if (_scanStartTime == 0) _scanStartTime = now;
        sendMetadata();
        _lastScanHopTime = now;
        Serial.println("[Scan] Searching on Channel " + String(_currentChannel) + "...");
      }
      return;
    }

    // 2. ล็อกช่องแล้ว แต่รอ Admin Approve / Config
    if (!_isConfigured) {
      if (now - _lastMetadataTime >= _metadataInterval) {
        _lastMetadataTime = now;
        sendMetadata();
        _unackedMetadataCount++;

        if (_unackedMetadataCount > 3) {
          Serial.println("\n[Core] No ACK from Gateway! Restarting scan...");
          _isChannelLocked = false;
          _unackedMetadataCount = 0;
          _scanStartTime = now;
          _metadataInterval = 5000;
        } else {
          _metadataInterval *= 2;
          if (_metadataInterval > MAX_METADATA_INTERVAL) {
            _metadataInterval = MAX_METADATA_INTERVAL;
          }
        }
      }
      return;
    }

    // 3. โหมดปกติ: ส่ง Telemetry ตามรอบเวลา + Random Jitter
    unsigned long targetInterval = ((unsigned long)_telemetryInterval * 1000UL) + _nextJitterMs;
    if (now - _lastTelemetryTime >= targetInterval) {
      sendTelemetryNow();
    }
  }

  void sendTelemetryNow() {
    if (!_isChannelLocked || !_isConfigured) return;

    TelemetryPacket pkt = {};
    pkt.msg_type = MSG_TYPE_TELEMETRY;
    strncpy(pkt.device_id, _deviceId.c_str(), sizeof(pkt.device_id) - 1);

    if (_telemetryFillCb) {
      _telemetryFillCb(pkt);
    }

    esp_now_send(_gatewayAddress, (uint8_t*)&pkt, sizeof(pkt));
    _lastTelemetryTime = millis();
    _nextJitterMs = random(100, 1500);
  }

  void sendMetadata() {
    MetadataPacket pkt = {};
    pkt.msg_type = MSG_TYPE_METADATA;
    strncpy(pkt.device_id, _deviceId.c_str(), sizeof(pkt.device_id) - 1);
    strncpy(pkt.device_type, _deviceType.c_str(), sizeof(pkt.device_type) - 1);
    strncpy(pkt.firmware_version, _firmwareVersion.c_str(), sizeof(pkt.firmware_version) - 1);

    esp_now_send(_broadcastAddress, (uint8_t*)&pkt, sizeof(pkt));
    Serial.println("[Core] Broadcast Metadata (" + _deviceId + ")...");
  }

  // Callback Registration
  void onTelemetryFill(TelemetryFillCallback cb) { _telemetryFillCb = cb; }
  void onCommand(CommandCallback cb)             { _commandCb = cb; }

  // Getters
  bool isConfigured() const          { return _isConfigured; }
  bool isChannelLocked() const       { return _isChannelLocked; }
  bool isReady() const               { return _isChannelLocked && _isConfigured; }
  int getSamplingInterval() const    { return _samplingInterval; }
  int getTelemetryInterval() const   { return _telemetryInterval; }
  uint8_t getPin1() const            { return _pin1; }
  uint8_t getPin2() const            { return _pin2; }
  uint8_t getPin3() const            { return _pin3; }
  uint8_t getPin4() const            { return _pin4; }
  String getDeviceId() const         { return _deviceId; }

private:
  // ใช้ static local variable เพื่อให้รองรับทั้ง C++11 (ESP32 Core 2.x) และ C++17+ (Core 3.x)
  static SmartClassNodeCore*& instance() {
    static SmartClassNodeCore* inst = nullptr;
    return inst;
  }

  #if defined(ESP_IDF_VERSION_VAL) && (ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 5, 0))
    static void _onDataSent(const wifi_tx_info_t* tx_info, esp_now_send_status_t status) {
        (void)tx_info;
        if (instance()) instance()->handleDataSent(status);
    }
    #else
    static void _onDataSent(const uint8_t* mac_addr, esp_now_send_status_t status) {
        (void)mac_addr;
        if (instance()) instance()->handleDataSent(status);
    }
    #endif

    #if defined(ESP_IDF_VERSION_VAL) && (ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0))
    static void _onDataRecv(const esp_now_recv_info_t* info, const uint8_t* incomingData, int len) {
        if (instance() && info) instance()->handleDataRecv(info->src_addr, incomingData, len);
    }
    #else
    static void _onDataRecv(const uint8_t* mac, const uint8_t* incomingData, int len) {
        if (instance()) instance()->handleDataRecv(mac, incomingData, len);
    }
    #endif

  void handleDataSent(esp_now_send_status_t status) {
    if (status != ESP_NOW_SEND_SUCCESS && _isChannelLocked) {
      _isChannelLocked = false;
      _scanStartTime = millis();
      Serial.println("\n[Core] Connection Lost! Target Unreachable. Restarting Channel Scan...");
    }
  }

  void handleDataRecv(const uint8_t* mac, const uint8_t* incomingData, int len) {
    if (len < 1) return;
    uint8_t msgType = incomingData[0];

    // 1. LOCAL ACK (99)
    if (msgType == MSG_TYPE_LOCAL_ACK) {
      _unackedMetadataCount = 0;
      memcpy(_gatewayAddress, mac, 6);

      if (!esp_now_is_peer_exist(_gatewayAddress)) {
        esp_now_peer_info_t peerInfo = {};
        memcpy(peerInfo.peer_addr, _gatewayAddress, 6);
        peerInfo.channel = 0;
        peerInfo.encrypt = false;
        esp_now_add_peer(&peerInfo);
      }

      if (!_isChannelLocked) {
        _isChannelLocked = true;
        unsigned long scanDuration = millis() - _scanStartTime;
        _prefs.begin("smartclass", false);
        _prefs.putInt("channel", _currentChannel);
        _prefs.end();

        Serial.println("========================================");
        Serial.println("[Core] Gateway Found & Locked!");
        Serial.println("-> Device ID      : " + _deviceId);
        Serial.println("-> Target Channel : " + String(_currentChannel));
        Serial.println("-> Time Taken     : " + String(scanDuration) + " ms");
        Serial.println("========================================");
      }
      return;
    }

    // 2. CONFIG PACKET (3)
    if (msgType == MSG_TYPE_CONFIG && len == sizeof(ConfigPacket)) {
      memcpy(&_pendingConfig, incomingData, sizeof(ConfigPacket));
      _pendingConfigApply = true;
      Serial.println("\n[Core] Rx: Received CONFIGURATION from Platform");
      return;
    }

    // 3. COMMAND PACKET (4)
    if (msgType == MSG_TYPE_COMMAND && len == sizeof(CommandPacket)) {
      CommandPacket* pkt = (CommandPacket*)incomingData;
      if (pkt->command_code == CMD_FACTORY_RESET) {
        _pendingFactoryReset = true;
        return;
      }
      if (_commandCb) {
        _commandCb(pkt->command_code);
      }
    }
  }

  void _savePendingConfig() {
    _telemetryInterval = _pendingConfig.telemetry_interval;
    _samplingInterval  = _pendingConfig.sampling_interval;
    _isConfigured      = true;

    if (_pendingConfig.pin_1 != PIN_UNASSIGNED) _pin1 = _pendingConfig.pin_1;
    if (_pendingConfig.pin_2 != PIN_UNASSIGNED) _pin2 = _pendingConfig.pin_2;
    if (_pendingConfig.pin_3 != PIN_UNASSIGNED) _pin3 = _pendingConfig.pin_3;
    if (_pendingConfig.pin_4 != PIN_UNASSIGNED) _pin4 = _pendingConfig.pin_4;

    _prefs.begin("smartclass", false);
    _prefs.putBool("is_configured", true);
    _prefs.putInt("tel_interval", _telemetryInterval);
    _prefs.putInt("spl_interval", _samplingInterval);
    _prefs.putInt("pin_1", _pin1);
    _prefs.putInt("pin_2", _pin2);
    _prefs.putInt("pin_3", _pin3);
    _prefs.putInt("pin_4", _pin4);
    _prefs.end();
  }

  Preferences _prefs;
  String _deviceId;
  String _deviceType;
  String _firmwareVersion;

  bool _isConfigured = false;
  bool _isChannelLocked = false;
  int _samplingInterval = 5;
  int _telemetryInterval = 300;

  uint8_t _pin1 = 32;
  uint8_t _pin2 = 255;
  uint8_t _pin3 = 255;
  uint8_t _pin4 = 255;

  int _currentChannel = 1;
  int _unackedMetadataCount = 0;
  unsigned long _scanStartTime = 0;
  unsigned long _lastScanHopTime = 0;
  unsigned long _lastMetadataTime = 0;
  unsigned long _lastTelemetryTime = 0;
  unsigned long _metadataInterval = 5000;
  unsigned long _nextJitterMs = 500;

  static const int SCAN_HOP_INTERVAL = 200;
  static const unsigned long MAX_METADATA_INTERVAL = 300000;

  uint8_t _broadcastAddress[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  uint8_t _gatewayAddress[6]   = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

  volatile bool _pendingFactoryReset = false;
  volatile bool _pendingConfigApply  = false;
  ConfigPacket _pendingConfig = {};

  TelemetryFillCallback _telemetryFillCb = nullptr;
  CommandCallback _commandCb = nullptr;
};

#endif
