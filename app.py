import json
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify, render_template, g
from google import genai
from google.genai import types

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
DATABASE = "/tmp/health.db"

WHO_PROMPT = "You are MediGuide AI, a WHO-informed medical assistant. Analyze symptoms and images using WHO ICD-11 classifications and WHO Essential Medicines List 2023. Consider tropical and African diseases. Respond ONLY in this exact JSON format, no extra text, no markdown, no code blocks: {\"condition\":\"Disease name\",\"icd11_code\":\"ICD-11 code\",\"confidence\":\"low|moderate|high\",\"confidence_reason\":\"reason\",\"matched_symptoms\":[\"symptom 1\"],\"description\":\"WHO description\",\"urgency\":\"low|medium|high|emergency\",\"urgency_message\":\"action needed\",\"medicines\":[{\"name\":\"generic name\",\"dosage\":\"dosage\",\"purpose\":\"purpose\",\"who_listed\":true}],\"diet_advice\":{\"eat\":[\"food\"],\"avoid\":[\"food\"],\"hydration\":\"advice\"},\"lifestyle\":[\"tip\"],\"see_doctor\":true,\"doctor_reason\":\"reason\"}"

def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, "_database", None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        db.execute("""CREATE TABLE IF NOT EXISTS consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            symptoms TEXT,
            has_image INTEGER DEFAULT 0,
            condition_name TEXT,
            icd11_code TEXT,
            confidence TEXT,
            urgency TEXT,
            result_json TEXT)""")
        db.commit()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/analyze", methods=["POST"])
def analyze():
    symptoms = request.form.get("symptoms", "").strip()
    image_file = request.files.get("image")
    api_key = request.form.get("api_key", "").strip()
    if not symptoms and not image_file:
        return jsonify({"error": "Please provide symptoms or an image"}), 400
    if not api_key:
        return jsonify({"error": "Please enter your Gemini API key"}), 400
    try:
        client = genai.Client(api_key=api_key)
        parts = []
        if image_file:
            image_bytes = image_file.read()
            mime = image_file.content_type or "image/jpeg"
            parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime))
        if symptoms and image_file:
            parts.append("Patient symptoms: " + symptoms + "\n\nAlso analyze the uploaded image.")
        elif symptoms:
            parts.append("Patient symptoms: " + symptoms)
        else:
            parts.append("Analyze this image for visible signs of illness.")
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=parts,
            config=types.GenerateContentConfig(system_instruction=WHO_PROMPT)
        )
        raw = response.text.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw.strip())
        db = get_db()
        db.execute("INSERT INTO consultations (created_at, symptoms, has_image, condition_name, icd11_code, confidence, urgency, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (datetime.now().isoformat(), symptoms, 1 if image_file else 0,
             result.get("condition"), result.get("icd11_code"),
             result.get("confidence"), result.get("urgency"), json.dumps(result)))
        db.commit()
        return jsonify({"success": True, "result": result})
    except json.JSONDecodeError:
        return jsonify({"error": "Could not parse analysis. Please try again."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/history")
def history():
    db = get_db()
    rows = db.execute("SELECT id, created_at, symptoms, condition_name, icd11_code, confidence, urgency, has_image FROM consultations ORDER BY created_at DESC LIMIT 20").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/history/<int:cid>")
def consultation_detail(cid):
    db = get_db()
    row = db.execute("SELECT * FROM consultations WHERE id=?", (cid,)).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    d = dict(row)
    d["result_json"] = json.loads(d["result_json"])
    return jsonify(d)

@app.route("/api/stats")
def stats():
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM consultations").fetchone()[0]
    emergency = db.execute("SELECT COUNT(*) FROM consultations WHERE urgency=?", ("emergency",)).fetchone()[0]
    return jsonify({"total": total, "emergency": emergency})

init_db()
