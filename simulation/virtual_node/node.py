import socket
import json
import threading
import time
from datetime import datetime

# Node Config
DEVICE_ID = "lighting-node-001"
DEVICE_TYPE = "lighting"

# Simulated ESP-NOW Settings
GATEWAY_IP = "127.0.0.1"
GATEWAY_PORT = 5000
NODE_IP = "127.0.0.1"
NODE_PORT = 5001

node_metadata = {
    "device_id": DEVICE_ID,
    "device_type": DEVICE_TYPE,
    "device_name": "Lighting Node 001",
    "firmware_version": "1.0.0",
    "capabilities": [
        "lighting_control",
        "power_monitoring"
    ]
}

# State ตัวแปรสำหรับการส่ง Telemetry
is_configured = False
telemetry_interval = 5  # ค่าเริ่มต้น หากยังไม่ได้ Config

def esp_now_listener():
    """จำลองการรอรับข้อมูล Configuration จาก Gateway ผ่าน ESP-NOW"""
    global is_configured, telemetry_interval
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((NODE_IP, NODE_PORT))
    print(f"[Node] Listening for Simulated ESP-NOW on {NODE_IP}:{NODE_PORT}...")

    while True:
        data, addr = sock.recvfrom(2048)
        try:
            packet = json.loads(data.decode())
            if packet.get("type") == "config":
                config_payload = packet.get("payload", {})
                print("\n" + "="*50)
                print(f"[Node] SUCCESS! Received Configuration via Gateway:")
                print(json.dumps(config_payload, indent=2))
                print("="*50 + "\n")
                
                # อัปเดตการทำงานของ Node ตาม Config ที่ได้รับ
                if "telemetry_interval" in config_payload:
                    telemetry_interval = config_payload["telemetry_interval"]
                is_configured = True
                
        except Exception as e:
            print(f"[Node] Error parsing incoming packet: {e}")

def send_metadata_to_gateway():
    """ส่ง Metadata ให้ Gateway ผ่าน ESP-NOW"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    esp_now_packet = {
        "type": "metadata",
        "payload": node_metadata,
        "reply_port": NODE_PORT
    }
    print(f"[Node] Sending Metadata to Gateway via Simulated ESP-NOW...")
    sock.sendto(json.dumps(esp_now_packet).encode(), (GATEWAY_IP, GATEWAY_PORT))
    sock.close()

def send_telemetry_to_gateway():
    """จำลองการส่งข้อมูลเซ็นเซอร์ให้ Gateway"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    # ข้อมูลจำลอง
    payload = {
        "device_id": DEVICE_ID,
        "timestamp": datetime.now().isoformat(),
        "data": {
            "light_status": "ON",
            "power_usage_watts": 15.5
        }
    }
    
    esp_now_packet = {
        "type": "telemetry",
        "payload": payload
    }
    
    print(f"[Node] Sending Telemetry... (Power: 15.5 W)")
    sock.sendto(json.dumps(esp_now_packet).encode(), (GATEWAY_IP, GATEWAY_PORT))
    sock.close()

def main():
    listener_thread = threading.Thread(target=esp_now_listener, daemon=True)
    listener_thread.start()
    
    time.sleep(1) 
    send_metadata_to_gateway()

    try:
        while True:
            time.sleep(telemetry_interval)
            # จะส่ง Telemetry ก็ต่อเมื่อได้รับการ Approve และได้ Config แล้ว
            if is_configured:
                send_telemetry_to_gateway()
            else:
                print("[Node] Waiting for configuration before sending telemetry...")
    except KeyboardInterrupt:
        print("\n[Node] Shutting down.")

if __name__ == "__main__":
    main()
