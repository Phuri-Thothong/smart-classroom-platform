MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
PREFIX = "smart-classroom/psu_6610110598"
MQTT_METADATA_TOPIC = f"{PREFIX}/nodes/+/metadata"
MQTT_CONFIG_TOPIC = f"{PREFIX}/nodes/{{}}/config"
MQTT_TELEMETRY_TOPIC = f"{PREFIX}/nodes/+/telemetry"
MQTT_COMMAND_TOPIC = f"{PREFIX}/nodes/{{}}/command"

gateway_statuses = {}
# เก็บเวลาล่าสุดที่โหนดส่งสัญญาณเข้ามา แยก Heartbeat ออกจาก DB Storage
node_last_seen = {}
# เก็บสถานะล่าสุดของโหนดควบคุม สำหรับทำ Change-of-Value
node_last_states = {}
# เก็บค่าเซนเซอร์ล่าสุดของแต่ละโหนดใน RAM สำหรับแสดงบน KPI Summary Cards
node_last_telemetry = {}
mqtt_client = None

def get_default_telemetry_interval(device_type: str) -> int:
    if (device_type or "").lower() in ("lighting", "air_control"):
        return 120  # Heartbeat ทุก 2 นาที บันทึก DB เฉพาะตอน ON/OFF เปลี่ยน
    return 300      # 5 นาที สำหรับ energy_node, multi_sensor, occupancy
