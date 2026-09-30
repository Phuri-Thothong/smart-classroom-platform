import requests

API_URL = "http://localhost:8000/schedules"
ROOM_ID = "R201"

schedules = [
    {"room_id": ROOM_ID, "day_of_week": 2, "start_time": "08:00:00", "end_time": "08:50:00", "subject_code": "240-212", "subject_name": "PROBABILITY AND STATISTICS"},
    {"room_id": ROOM_ID, "day_of_week": 2, "start_time": "09:00:00", "end_time": "11:50:00", "subject_code": "240-392", "subject_name": "MODERN INDUSTRIAL AUTOMATION ENGINEER MODULE"},
    {"room_id": ROOM_ID, "day_of_week": 2, "start_time": "12:30:00", "end_time": "15:50:00", "subject_code": "240-371", "subject_name": "IOT SYSTEM DEVELOPER MODULE"},
    {"room_id": ROOM_ID, "day_of_week": 2, "start_time": "16:00:00", "end_time": "17:50:00", "subject_code": "240-328", "subject_name": "DATA ANALYTIC AND DATA SCIENCE"},
    {"room_id": ROOM_ID, "day_of_week": 3, "start_time": "08:00:00", "end_time": "09:50:00", "subject_code": "240-328", "subject_name": "DATA ANALYTIC AND DATA SCIENCE"},
    {"room_id": ROOM_ID, "day_of_week": 3, "start_time": "13:00:00", "end_time": "14:30:00", "subject_code": "241-204", "subject_name": "HAVE FUN WITH CALCULUS"},
    {"room_id": ROOM_ID, "day_of_week": 4, "start_time": "08:00:00", "end_time": "08:50:00", "subject_code": "240-212", "subject_name": "PROBABILITY AND STATISTICS"},
    {"room_id": ROOM_ID, "day_of_week": 4, "start_time": "13:00:00", "end_time": "15:50:00", "subject_code": "240-332", "subject_name": "GAME DESIGNER AND DEVELOPER MODULE"},
    {"room_id": ROOM_ID, "day_of_week": 5, "start_time": "08:00:00", "end_time": "08:50:00", "subject_code": "240-212", "subject_name": "PROBABILITY AND STATISTICS"},
    {"room_id": ROOM_ID, "day_of_week": 5, "start_time": "09:00:00", "end_time": "11:50:00", "subject_code": "240-371", "subject_name": "IOT SYSTEM DEVELOPER MODULE"},
    {"room_id": ROOM_ID, "day_of_week": 6, "start_time": "08:00:00", "end_time": "08:50:00", "subject_code": "240-212", "subject_name": "PROBABILITY AND STATISTICS"},
]

for s in schedules:
    response = requests.post(API_URL, json=s)
    if response.status_code == 200:
        print(f"Added: {s['subject_code']} on Day {s['day_of_week']}")
    else:
        print(f"Failed to add {s['subject_code']}: {response.text}")