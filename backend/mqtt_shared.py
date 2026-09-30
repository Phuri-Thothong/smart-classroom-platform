MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
PREFIX = "smart-classroom/psu_6610110598" 
MQTT_METADATA_TOPIC = f"{PREFIX}/nodes/+/metadata"
MQTT_CONFIG_TOPIC = f"{PREFIX}/nodes/{{}}/config"
MQTT_TELEMETRY_TOPIC = f"{PREFIX}/nodes/+/telemetry"
MQTT_COMMAND_TOPIC = f"{PREFIX}/nodes/{{}}/command"

gateway_statuses = {}
mqtt_client = None
