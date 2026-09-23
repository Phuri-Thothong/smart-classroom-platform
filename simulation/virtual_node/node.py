import socket
import json
import time
import threading
import sys
import random
import os

GATEWAY_IP = '127.0.0.1'
NODE_IP = '127.0.0.1'

def run_node(device_id, device_type, node_port, gateway_port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((NODE_IP, node_port))

    state = {
        "is_configured": False,
        "telemetry_interval": 5,
        "device_status": "OFF"
    }

    eeprom_file = f"eeprom_sim_{device_id}.json"
    if os.path.exists(eeprom_file):
        try:
            with open(eeprom_file, 'r') as f:
                saved_state = json.load(f)
                state.update(saved_state)
                print(f"[Node] BOOT: Restored state from Flash Memory (EEPROM)")
        except Exception as e:
            print(f"[Node] BOOT Error: Could not read EEPROM: {e}")

    def udp_listener():
        while True:
            try:
                data, addr = sock.recvfrom(1024)
                msg = json.loads(data.decode())
                msg_type = msg.get("type")
                
                if msg_type == "config":
                    payload = msg.get("payload", {})
                    if isinstance(payload, str):
                        payload = json.loads(payload)
                        
                    print(f"\n[Node] SUCCESS! Received Configuration")
                    if "telemetry_interval" in payload:
                        state["telemetry_interval"] = int(payload["telemetry_interval"])
                    
                    state["is_configured"] = True
                    with open(eeprom_file, 'w') as f:
                        json.dump(state, f)

                elif msg_type == "command":
                    payload = msg.get("payload", {})
                    action = payload.get("action", "OFF")
                    print(f"\n[Node] >>> COMMAND RECEIVED: Turned {action} <<<")
                    
                    if action == "RESET":
                        print("[Node] Factory Reset triggered by Platform! Clearing EEPROM...")
                        state["is_configured"] = False
                        if os.path.exists(eeprom_file):
                            os.remove(eeprom_file)
                    else:
                        state["device_status"] = action

            except ConnectionResetError:
                pass
            except Exception as e:
                print(f"Error parsing UDP: {e}")

    threading.Thread(target=udp_listener, daemon=True).start()
    print(f"[Node] Started {device_id} ({device_type}) on port {node_port} targeting Gateway port {gateway_port}")

    # Main Loop
    while True:
        if not state["is_configured"]:
            metadata = {
                "type": "metadata",
                "payload": {
                    "device_id": device_id,
                    "device_type": device_type,
                    "firmware_version": "1.0.0-sim"
                }
            }
            sock.sendto(json.dumps(metadata).encode(), (GATEWAY_IP, gateway_port))
            print(f"[Node: {device_id}] Sent Metadata via ESP-NOW Broadcast")
            time.sleep(5) 
        else:
            if state["device_status"] == "ON":
                power = round(random.uniform(50.0, 70.0), 2)
            else:
                power = 0.0

            telemetry = {
                "type": "telemetry",
                "payload": {
                    "device_id": device_id,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "data": {
                        "status": state["device_status"],
                        "power_usage_watts": power
                    }
                }
            }
            sock.sendto(json.dumps(telemetry).encode(), (GATEWAY_IP, gateway_port))
            print(f"[Node: {device_id}] Sent Telemetry (Status: {state['device_status']}, Power: {power} W)")
            
            jitter = round(random.uniform(0.1, 2.0), 2)
            sleep_time = state["telemetry_interval"] + jitter
            print(f"[Node: {device_id}] Next transmission in {sleep_time:.2f} seconds (included {jitter:.2f}s jitter)")
            time.sleep(sleep_time)

if __name__ == "__main__":
    d_id = sys.argv[1] if len(sys.argv) > 1 else "sim-lighting-01"
    d_type = sys.argv[2] if len(sys.argv) > 2 else "lighting"
    port = int(sys.argv[3]) if len(sys.argv) > 3 else random.randint(6000, 7000)
    g_port = int(sys.argv[4]) if len(sys.argv) > 4 else 5000 
    
    run_node(d_id, d_type, port, g_port)
