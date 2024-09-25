from ultralytics import YOLO
from flask import Flask, request, jsonify
from flask_cors import CORS  # Import CORS
import numpy as np
import cv2
import math
import requests
import json
import time
from dotenv import load_dotenv
import os

from twilio.rest import Client

load_dotenv()

# Configurações da Twilio (substitua pelos seus dados)
account_sid = os.getenv('ACCOUNT_SID')  # Seu Account SID
auth_token = os.getenv('AUTH_TOKEN')     # Seu Auth Token
twilio_client = Client(account_sid, auth_token)

def send_fall_alert_sms():
    try:
        message = twilio_client.messages.create(
            body='Alerta! Uma pessoa foi detectada em queda.',
            from_='+12082719662',  # Número de telefone Twilio
            to='+5535987036620'     # Número de telefone que vai receber o SMS
        )
        print(f"Mensagem enviada: {message.sid}")
    except Exception as e:
        print(f"Erro ao enviar SMS: {str(e)}")


# Initialize Flask app
app = Flask(__name__)

# Apply CORS to the app
CORS(app)  # This will enable CORS for all routes

# Load model
model = YOLO("best.pt")

# Object classes
classNames = ["person-fall", "person-in-bed", "person-moving-out", "person-near-fall", "person-out"]

# Node.js endpoint URL
url = "http://localhost:3000/fhir"

# Initialize last_alert_time for tracking
last_alert_time = {
    "person-out": 0,
    "person-fall": 0
}

# Set the alert interval (10 minutes in seconds)
alert_interval = 10 * 60

def sendMessage(confidence, class_name, alert_message):
    print(alert_message)

    fhir_data = {
        "resourceType": "Observation",
        "id": "example",
        "status": "final",
        "code": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": "safety",
                    "display": class_name
                }
            ],
            "text": class_name
        },
        "valueString": alert_message,
        "component": [
            {
                "code": {
                    "coding": [
                        {
                            "system": "http://hl7.org/fhir/R4",
                            "code": "confidence",
                            "display": "Confidence Level"
                        }
                    ],
                    "text": "Confidence Level"
                },
                "valueQuantity": {
                    "value": confidence,
                    "unit": "%"
                }
            }
        ]
    }

    headers = {'Content-Type': 'application/json'}
    response = requests.post(url, data=json.dumps(fhir_data), headers=headers)

    if response.status_code == 200:
        print("Message sent to Node.js server successfully")
    else:
        print(f"Failed to send message: {response.status_code} {response.text}")

@app.route('/process-image', methods=['POST'])
def process_image():
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image_file = request.files['image']
    np_img = np.frombuffer(image_file.read(), np.uint8)
    img = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

    results = model(img, stream=True)
    response_data = []

    for r in results:
        boxes = r.boxes
        for box in boxes:
            confidence = math.ceil((box.conf[0] * 100)) / 100

            x1, y1, x2, y2 = box.xyxy[0]
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

            cls = int(box.cls[0])
            print(cls)
            class_name = classNames[cls]
            current_time = time.time()

            if class_name == "person-out" and confidence > 0.75:
                if current_time - last_alert_time["person-out"] >= alert_interval:
                    alert_message = f"Alert: {class_name} detected with high confidence!"
                    # sendMessage(confidence, class_name, alert_message)
                    last_alert_time[class_name] = current_time

            if class_name == "person-fall" and confidence > 0.75:
                if current_time - last_alert_time["person-fall"] >= alert_interval:
                    alert_message = f"Alert: {class_name} detected with high confidence!"
                    # sendMessage(confidence, class_name, alert_message)
                    send_fall_alert_sms()  # Envia o SMS
                    last_alert_time[class_name] = current_time

            response_data.append({
                "class_name": class_name,
                "confidence": confidence,
                "bounding_box": [x1, y1, x2, y2]
            })

    return jsonify({"detections": response_data})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
