import socket
import json
import time
import threading
import sys
import random

GATEWAY_IP = '127.0.0.1'
GATEWAY_PORT = 5000
NODE_IP = '127.0.0.1'

def run_node(device_id, device_type, node_port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((NODE_IP, node_port))

    # สถานะของเครื่อง (is_configured = false แบบฮาร์ดแวร์จริง)
    state = {
        "is_configured": False,
        "telemetry_interval": 5
    }

    # ฟังก์ชันรอรับ Config
    def listen_for_config():
        while True:
            data, addr = sock.recvfrom(1024)
            try:
                msg = json.loads(data.decode())
                if msg.get("type") == "config":
                    payload = msg.get("payload", {})
                    if isinstance(payload, str):
                        payload = json.loads(payload)
                        
                    print(f"\n========================================")
                    print(f"[Node] SUCCESS! Received Configuration:")
                    print(json.dumps(payload, indent=2))
                    print(f"========================================\n")
                    
                    if "telemetry_interval" in payload:
                        state["telemetry_interval"] = int(payload["telemetry_interval"])
                    
                    state["is_configured"] = True
            except Exception as e:
                print(f"Error parsing Config: {e}")

    threading.Thread(target=listen_for_config, daemon=True).start()
    print(f"[Node] Started {device_id} ({device_type}) on port {node_port}")

    # Main Loop (เทียบเท่า void loop())
    while True:
        if not state["is_configured"]:
            # ส่ง Metadata (Exponential backoff 5 วิ แบบย่อ)
            metadata = {
                "type": "metadata",
                "payload": {
                    "device_id": device_id,
                    "device_type": device_type,
                    "firmware_version": "1.0.0-sim"
                }
            }
            sock.sendto(json.dumps(metadata).encode(), (GATEWAY_IP, GATEWAY_PORT))
            print("[Node] Sent Metadata via ESP-NOW Broadcast (Waiting for Config...)")
            time.sleep(5) 
        else:
            # ส่ง Telemetry
            telemetry = {
                "type": "telemetry",
                "payload": {
                    "device_id": device_id,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "data": {
                        "status": "ON" if device_type in ["lighting", "air_control"] else "DETECTED",
                        "power_usage_watts": round(random.uniform(10.0, 20.0), 2)
                    }
                }
            }
            sock.sendto(json.dumps(telemetry).encode(), (GATEWAY_IP, GATEWAY_PORT))
            print(f"[Node] Sent Telemetry (Power: {telemetry['payload']['data']['power_usage_watts']} W)")
            time.sleep(state["telemetry_interval"])

if __name__ == "__main__":
    # สามารถพิมพ์ Argument ต่อท้ายคำสั่งรันเพื่อสร้าง Node หลายตัวได้
    d_id = sys.argv[1] if len(sys.argv) > 1 else "sim-lighting-01"
    d_type = sys.argv[2] if len(sys.argv) > 2 else "lighting"
    # สุ่ม Port เพื่อให้รัน Node หลายตัวพร้อมกันในเครื่องเดียวได้
    port = int(sys.argv[3]) if len(sys.argv) > 3 else random.randint(6000, 7000)
    
    run_node(d_id, d_type, port)
    