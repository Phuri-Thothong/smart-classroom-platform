import paho.mqtt.client as mqtt
import socket
import json
import threading

# Gateway Config
GATEWAY_ID = "gateway-r201-001"
ROOM_ID = "R201"
MQTT_BROKER = "localhost"
MQTT_PORT = 1883

# Simulated ESP-NOW (UDP Configuration)
UDP_IP = "127.0.0.1"
UDP_PORT_RX = 5000

node_directory = {}

def on_mqtt_connect(client, userdata, flags, reason_code, properties):
    print(f"[Gateway] Connected to MQTT Broker with result code {reason_code}")
    client.subscribe("smart-classroom/nodes/+/config")

def on_mqtt_message(client, userdata, msg):
    try:
        topic_parts = msg.topic.split('/')
        if len(topic_parts) >= 4 and topic_parts[3] == "config":
            device_id = topic_parts[2]
            payload = json.loads(msg.payload.decode())
            
            if device_id in node_directory:
                node_addr = node_directory[device_id]
                esp_now_packet = {
                    "type": "config",
                    "payload": payload
                }
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.sendto(json.dumps(esp_now_packet).encode(), node_addr)
                sock.close()
                print(f"[Gateway] Config sent to {device_id} via ESP-NOW to {node_addr}")
    except Exception as e:
        print(f"[Gateway] Error processing MQTT message: {e}")

def esp_now_listener(mqtt_client):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT_RX))
    print(f"[Gateway] Listening for Simulated ESP-NOW on {UDP_IP}:{UDP_PORT_RX}...")

    while True:
        data, addr = sock.recvfrom(2048)
        try:
            packet = json.loads(data.decode())
            payload = packet.get("payload", {})
            device_id = payload.get("device_id")

            if not device_id:
                continue

            if packet.get("type") == "metadata":
                # --- แก้ไข: ดึง reply_port ที่ Node ส่งมาให้ ---
                reply_port = packet.get("reply_port", addr[1])
                node_directory[device_id] = (addr[0], reply_port)
                
                payload["gateway_id"] = GATEWAY_ID
                payload["room_id"] = ROOM_ID
                
                print(f"[Gateway] Received Metadata from {device_id}. Forwarding...")
                mqtt_client.publish(f"smart-classroom/nodes/{device_id}/metadata", json.dumps(payload))

            elif packet.get("type") == "telemetry":
                payload["gateway_id"] = GATEWAY_ID
                payload["room_id"] = ROOM_ID
                
                print(f"[Gateway] Received Telemetry from {device_id}. Forwarding...")
                mqtt_client.publish(f"smart-classroom/nodes/{device_id}/telemetry", json.dumps(payload))

        except Exception as e:
            print(f"[Gateway] Error parsing ESP-NOW packet: {e}")

def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=GATEWAY_ID)
    
    client.on_connect = on_mqtt_connect
    client.on_message = on_mqtt_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)

    esp_now_thread = threading.Thread(target=esp_now_listener, args=(client,), daemon=True)
    esp_now_thread.start()

    client.loop_forever()

if __name__ == "__main__":
    main()
