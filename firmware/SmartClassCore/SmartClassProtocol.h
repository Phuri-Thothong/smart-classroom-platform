#ifndef SMART_CLASS_PROTOCOL_H
#define SMART_CLASS_PROTOCOL_H

#include <Arduino.h>

// Message Types (ต้องตรงกับ ESP32_Gateway.ino 100%)
#define MSG_TYPE_TELEMETRY  1
#define MSG_TYPE_METADATA   2
#define MSG_TYPE_CONFIG     3
#define MSG_TYPE_COMMAND    4
#define MSG_TYPE_LOCAL_ACK  99

// Command Codes
#define CMD_OFF            0
#define CMD_ON             1
#define CMD_FACTORY_RESET  99

// ค่า Default เมื่อ Platform ไม่ได้ระบุขามา
#define PIN_UNASSIGNED     255

// ==========================================
// BINARY STRUCTS (ขนาดรวมน้อยกว่า 250 bytes)
// ==========================================
typedef struct {
  uint8_t msg_type;
  char device_id[20];
  uint8_t status;
  float power_usage_watts;
  float temperature;
  float humidity;
  float lux;
} TelemetryPacket;

typedef struct {
  uint8_t msg_type;
  char device_id[20];
  char device_type[16];
  char firmware_version[8];
} MetadataPacket;

typedef struct {
  uint8_t msg_type;
  uint16_t sampling_interval;
  uint16_t telemetry_interval;
  uint8_t pin_1; // Control หรือ Sensor หรือ RX
  uint8_t pin_2; // TX หรือ DHT
  uint8_t pin_3; // SDA
  uint8_t pin_4; // SCL
} ConfigPacket;

typedef struct {
  uint8_t msg_type;
  uint8_t command_code;
} CommandPacket;

#endif
