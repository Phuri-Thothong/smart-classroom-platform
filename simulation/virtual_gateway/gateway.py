import socket
import json
import threading
import paho.mqtt.client as mqtt

# ==========================================
# CONFIGURATION
# ==========================================
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
PREFIX = "smart-classroom/psu_6610110598"
GATEWAY_ID = "gateway-r201-001"
ROOM_ID = "R201"

UDP_IP = "127.0.0.1"
UDP_PORT = 5000

node_directory = {} 

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))

# ==========================================
# MQTT Callbacks
# ==========================================
def on_connect(client, userdata, flags, rc):
    print(f"[MQTT] Connected with result code {rc}")
    client.subscribe(f"{PREFIX}/nodes/+/config")
    client.subscribe(f"{PREFIX}/nodes/+/command") # เพิ่มการรับฟัง Command
    print(f"[MQTT] Subscribed to Config and Command topics")

def on_message(client, userdata, msg):
    topic_str = msg.topic
    print(f"\n[MQTT] Received on: {topic_str}")
    
    parts = topic_str.split('/')
    if len(parts) >= 2:
        endpoint = parts[-1] # จะเป็น "config" หรือ "command"
        device_id = parts[-2]
        
        if endpoint in ["config", "command"]:
            if device_id in node_directory:
                target_addr = node_directory[device_id]
                try:
                    payload_data = json.loads(msg.payload.decode())
                except json.JSONDecodeError:
                    payload_data = msg.payload.decode()
                    
                # ส่ง Data Packet ต่อให้ Node (ไม่ต้องหุ้ม type ซ้อนแล้ว เพราะ API หุ้มมาให้แล้ว)
                sock.sendto(json.dumps(payload_data).encode(), target_addr)
                print(f"[ESP-NOW Sim] {endpoint.upper()} forwarded to Node: {device_id}")
            else:
                print(f"[Gateway] Error: Address not found for device: {device_id}")

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

# ==========================================
# ESP-NOW Receive Callback Simulation
# ==========================================
def udp_listener():
    print(f"[Gateway] Ready. Listening for ESP-NOW sim on port {UDP_PORT}")
    while True:
        data, addr = sock.recvfrom(1024)
        try:
            doc = json.loads(data.decode())
            msg_type = doc.get("type")
            payload = doc.get("payload", {})
            device_id = payload.get("device_id")

            if device_id and device_id != "null":
                node_directory[device_id] = addr
                payload["gateway_id"] = GATEWAY_ID
                payload["room_id"] = ROOM_ID

                mqtt_payload = json.dumps(payload)
                
                if msg_type == "metadata":
                    topic = f"{PREFIX}/nodes/{device_id}/metadata"
                    mqtt_client.publish(topic, mqtt_payload)
                    print(f"[Gateway] Forwarded Metadata to Cloud for {device_id}")
                elif msg_type == "telemetry":
                    topic = f"{PREFIX}/nodes/{device_id}/telemetry"
                    mqtt_client.publish(topic, mqtt_payload)
                    print(f"[Gateway] Forwarded Telemetry to Cloud for {device_id}")
        except Exception as e:
            print(f"[Gateway] Error processing packet: {e}")

if __name__ == "__main__":
    threading.Thread(target=udp_listener, daemon=True).start()
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_forever()
    