import socket
import json
import threading
import logging
import paho.mqtt.client as mqtt

# ==========================================
# CONFIGURATION & LOGGING SETUP
# ==========================================
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
PREFIX = "smart-classroom/psu_6610110598"
GATEWAY_ID = "gateway-r201-001"
ROOM_ID = "R201"

UDP_IP = "127.0.0.1"
UDP_PORT = 5000

# ตั้งค่า Logging ให้บันทึกลงไฟล์และแสดงบนจอ
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s.%(msecs)03d | %(levelname)-7s | %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.FileHandler("gateway_flow.log", mode='w', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Gateway")

node_directory = {} 
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))

# ==========================================
# MQTT Callbacks
# ==========================================
def on_connect(client, userdata, flags, rc):
    logger.info(f"[MQTT] Connected to Cloud (Code {rc})")
    client.subscribe(f"{PREFIX}/nodes/+/config")
    client.subscribe(f"{PREFIX}/nodes/+/command")
    logger.info("[MQTT] Subscribed to Config & Command topics")

def on_message(client, userdata, msg):
    topic_str = msg.topic
    parts = topic_str.split('/')
    if len(parts) >= 2:
        endpoint = parts[-1] 
        device_id = parts[-2]
        
        logger.info(f"[MQTT -> Gateway] Rx: {endpoint.upper()} for {device_id}")
        
        if endpoint in ["config", "command"]:
            if device_id in node_directory:
                target_addr = node_directory[device_id]
                try:
                    payload_data = json.loads(msg.payload.decode())
                except json.JSONDecodeError:
                    payload_data = msg.payload.decode()
                    
                sock.sendto(json.dumps(payload_data).encode(), target_addr)
                logger.info(f"[Gateway -> ESP-NOW] Tx: Forwarded {endpoint.upper()} to {device_id}")
            else:
                logger.warning(f"[Gateway] Error: No local address found for {device_id}")

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

# ==========================================
# ESP-NOW Receive Callback Simulation
# ==========================================
def udp_listener():
    logger.info(f"[Gateway] Ready. Listening for ESP-NOW UDP on port {UDP_PORT}")
    while True:
        data, addr = sock.recvfrom(1024)
        try:
            doc = json.loads(data.decode())
            msg_type = doc.get("type")
            payload = doc.get("payload", {})
            device_id = payload.get("device_id")

            if device_id and device_id != "null":
                # บันทึกตอนได้รับแพ็กเก็ตจาก Node ทันที (เพื่อเช็ก Jitter)
                logger.info(f"[ESP-NOW -> Gateway] Rx: {msg_type.upper()} from {device_id}")
                
                node_directory[device_id] = addr
                payload["gateway_id"] = GATEWAY_ID
                payload["room_id"] = ROOM_ID

                mqtt_payload = json.dumps(payload)
                topic = f"{PREFIX}/nodes/{device_id}/{msg_type}"
                mqtt_client.publish(topic, mqtt_payload)
                
                logger.info(f"[Gateway -> MQTT] Tx: Forwarded {msg_type.upper()} to Cloud for {device_id}")
                
        except Exception as e:
            logger.error(f"[Gateway] Packet Error: {e}")

if __name__ == "__main__":
    threading.Thread(target=udp_listener, daemon=True).start()
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_forever()
    