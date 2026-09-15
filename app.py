import hmac
import json
import os
from datetime import datetime, timezone
from functools import wraps
from typing import Any

import certifi
from dotenv import load_dotenv
from flask import Flask, jsonify, request, session, redirect, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.errors import PyMongoError, DuplicateKeyError
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from authlib.integrations.flask_client import OAuth
from authlib.integrations.base_client.errors import OAuthError



try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


# ============================================================
# PATH / ENVIRONMENT
# ============================================================

APP_DIRECTORY = os.path.dirname(os.path.abspath(__file__))

ENV_FILE = os.path.join(APP_DIRECTORY, ".env")
ALT_ENV_FILE = os.path.join(APP_DIRECTORY, "atlas-credentials.env")

for env_path in (ENV_FILE, ALT_ENV_FILE):
    if os.path.exists(env_path):
        load_dotenv(env_path, override=False)

MONGODB_URI = os.getenv("MONGODB_URI")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "lifeos")

SECRET_KEY = os.getenv("FLASK_SECRET_KEY")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")

AUTHORITY_EMAILS = {
    email.strip().lower()
    for email in os.getenv("AUTHORITY_EMAILS", "").split(",")
    if email.strip()
}
AUTHORITY_ACCESS_CODE = os.getenv("AUTHORITY_ACCESS_CODE", "")

SESSION_COOKIE_SECURE = (
    os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://127.0.0.1:5000,"
        "http://localhost:5000,"
        "http://127.0.0.1:5500,"
        "http://localhost:5500",
    ).split(",")
    if origin.strip()
]


# ============================================================
# FLASK APP
# ============================================================

# IMPORTANT:
# All LifeOS files are in the same folder.
# Therefore Flask serves frontend files from APP_DIRECTORY.

app = Flask(
    __name__,
    static_folder=APP_DIRECTORY,
    static_url_path=""
)

app.config.update(
    SECRET_KEY=SECRET_KEY or "development-only-change-this-secret",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=SESSION_COOKIE_SECURE,
)


# ============================================================
# CORS
# ============================================================

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": ALLOWED_ORIGINS
        }
    },
    supports_credentials=True,
)


# ============================================================
# MONGODB
# ============================================================

client: Any = None
db: Any = None

users: Any = None
medical_profiles: Any = None
reports: Any = None

if MONGODB_URI:
    try:
        client = MongoClient(
            MONGODB_URI,
            tls=True,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=20000,
            socketTimeoutMS=20000
        )

        db = client[DATABASE_NAME]

        users = db["users"]
        medical_profiles = db["medical_profiles"]
        reports = db["emergency_reports"]

    except Exception as e:
        print("MongoDB setup error:", str(e))


# ============================================================
# OPENAI
# ============================================================

openai_client: Any = None

if OPENAI_API_KEY and OpenAI:
    try:
        openai_client = OpenAI(
            api_key=OPENAI_API_KEY,
            timeout=12.0,
            max_retries=0
        )
    except Exception as e:
        print("OpenAI setup error:", str(e))


# ============================================================
# STARTUP DIAGNOSTICS
# ============================================================

print("\n========================================")
print("             LIFEOS BACKEND")
print("========================================")

print("App directory:", APP_DIRECTORY)
print("ENV file:", ENV_FILE)
print("ENV exists:", os.path.exists(ENV_FILE))

print(
    "MongoDB URI loaded:",
    bool(MONGODB_URI)
)

print(
    "OpenAI API key loaded:",
    bool(OPENAI_API_KEY)
)

print(
    "Database:",
    DATABASE_NAME
)

print("========================================\n")


# ============================================================
# HELPERS
# ============================================================

def database_configured():
    return client is not None and db is not None



def ai_configured():
    return openai_client is not None


def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):

        if "user_id" not in session:
            return jsonify({
                "error": "Authentication required."
            }), 401

        return function(*args, **kwargs)

    return wrapper


def authority_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Authentication required."}), 401

        if not database_configured() or not AUTHORITY_EMAILS:
            return jsonify({"error": "Authority access is not configured."}), 403

        try:
            user = users.find_one({"_id": ObjectId(session["user_id"])}, {"email": 1})
        except (PyMongoError, Exception):
            user = None

        if not user or user.get("email", "").lower() not in AUTHORITY_EMAILS:
            return jsonify({"error": "Authority access required."}), 403

        return function(*args, **kwargs)

    return wrapper


def serialize_report(report):

    report = dict(report)

    if "_id" in report:
        report["_id"] = str(report["_id"])

    if "user_id" in report:
        report["user_id"] = str(report["user_id"])

    if isinstance(report.get("created_at"), datetime):
        report["created_at"] = report["created_at"].isoformat()

    return report


def serialize_user(user):

    if not user:
        return None

    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "is_authority": user.get("email", "").lower() in AUTHORITY_EMAILS
    }


# ============================================================
# FRONTEND ROUTES
# ============================================================

@app.route("/")
def home():

    if "user_id" not in session:
        return redirect("/login")

    return send_from_directory(
        APP_DIRECTORY,
        "index.html"
    )


@app.route("/login")
def login_page():

    if "user_id" in session:
        return redirect("/")

    return send_from_directory(
        APP_DIRECTORY,
        "login.html"
    )


@app.route("/authority/login")
def authority_login_page():
    return send_from_directory(APP_DIRECTORY, "authority-login.html")


@app.route("/authority")
@authority_required
def authority_page():
    return send_from_directory(APP_DIRECTORY, "authority.html")


# ============================================================
# HEALTH CHECK
# ============================================================

@app.route("/api/health", methods=["GET"])
def health():
    database_status = "not_configured"

    if not MONGODB_URI:
        database_status = "not_configured"

    elif client:
        try:
            client.admin.command("ping")
            database_status = "connected"
        except Exception as e:
            print("MongoDB health check error:", str(e))
            database_status = "unavailable"

    return jsonify({
        "status": "ok",
        "database": database_status,
        "database_name": DATABASE_NAME,
        "ai": "configured" if openai_client else "not_configured"
    })


# ============================================================
# REGISTER
# ============================================================

@app.route("/api/auth/register", methods=["POST"])
def register():

    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    data = request.get_json(silent=True) or {}

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not name:
        return jsonify({
            "error": "Name is required."
        }), 400

    if not email:
        return jsonify({
            "error": "Email is required."
        }), 400

    if not password:
        return jsonify({
            "error": "Password is required."
        }), 400

    if len(password) < 6:
        return jsonify({
            "error": "Password must contain at least 6 characters."
        }), 400

    try:

        existing_user = users.find_one({
            "email": email
        })

        if existing_user:
            return jsonify({
                "error": "An account with this email already exists."
            }), 409

        user = {
            "name": name,
            "email": email,
            "password_hash": generate_password_hash(password),
            "created_at": datetime.now(timezone.utc)
        }

        result = users.insert_one(user)

        session["user_id"] = str(result.inserted_id)

        return jsonify({
            "message": "Registration successful.",
            "user": {
                "id": str(result.inserted_id),
                "name": name,
                "email": email
            }
        }), 201

    except DuplicateKeyError:

        return jsonify({
            "error": "An account with this email already exists."
        }), 409

    except PyMongoError as e:

        print("Registration database error:", str(e))

        return jsonify({
            "error": "Database error while creating account."
        }), 500


# ============================================================
# LOGIN
# ============================================================

@app.route("/api/auth/login", methods=["POST"])
def login():

    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    data = request.get_json(silent=True) or {}

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    account_type = data.get("accountType", "user")
    authority_code = data.get("authorityCode", "")
    if not isinstance(authority_code, str):
        authority_code = ""

    if not email or not password:
        return jsonify({
            "error": "Email and password are required."
        }), 400

    try:

        user = users.find_one({
            "email": email
        })

        if not user:
            return jsonify({
                "error": "Invalid email or password."
            }), 401

        if not check_password_hash(
            user.get("password_hash", ""),
            password
        ):
            return jsonify({
                "error": "Invalid email or password."
            }), 401

        is_authority = email in AUTHORITY_EMAILS
        if account_type not in {"user", "authority"}:
            return jsonify({
                "error": "Choose User or Authority."
            }), 400
        if account_type == "authority" and (
            not is_authority
            or not AUTHORITY_ACCESS_CODE
            or not hmac.compare_digest(authority_code, AUTHORITY_ACCESS_CODE)
        ):
            return jsonify({
                "error": "The authority email or access code is not valid."
            }), 403

        session["user_id"] = str(user["_id"])

        return jsonify({
            "message": "Login successful.",
            "user": serialize_user(user)
        })

    except PyMongoError as e:

        print("Login database error:", str(e))

        return jsonify({
            "error": "Database error during login."
        }), 500


# ============================================================
# CURRENT USER
# ============================================================

@app.route("/api/auth/me", methods=["GET"])
def current_user():

    if "user_id" not in session:
        return jsonify({
            "authenticated": False
        })

    if not database_configured():
        return jsonify({
            "authenticated": False,
            "error": "Database unavailable."
        }), 503

    try:

        user = users.find_one({
            "_id": ObjectId(session["user_id"])
        })

        if not user:

            session.clear()

            return jsonify({
                "authenticated": False
            })

        return jsonify({
            "authenticated": True,
            "user": serialize_user(user)
        })

    except (PyMongoError, Exception) as e:

        print("Current user error:", str(e))

        return jsonify({
            "authenticated": False
        }), 500


# ============================================================
# LOGOUT
# ============================================================

@app.route("/api/auth/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "message": "Logged out successfully."
    })


# ============================================================
# MEDICAL PROFILE - GET
# ============================================================

@app.route("/api/profile", methods=["GET"])
@login_required
def get_profile():

    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    try:

        user_id = ObjectId(session["user_id"])

        profile = medical_profiles.find_one({
            "user_id": user_id
        })

        if not profile:
            return jsonify({
                "profile": {}
            })

        profile = dict(profile)

        profile.pop("_id", None)
        profile.pop("user_id", None)

        return jsonify({
            "profile": profile
        })

    except Exception as e:

        print("Get profile error:", str(e))

        return jsonify({
            "error": "Unable to load medical profile."
        }), 500


# ============================================================
# MEDICAL PROFILE - UPDATE
# ============================================================

@app.route("/api/profile", methods=["PUT"])
@login_required
def update_profile():

    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    data = request.get_json(silent=True) or {}

    allowed_fields = [
        "age",
        "gender",
        "blood_group",
        "allergies",
        "medications",
        "medical_conditions",
        "emergency_contact",
        "emergency_phone",
        "address"
    ]

    profile_data = {}

    for field in allowed_fields:

        if field in data:
            profile_data[field] = data[field]

    profile_data["updated_at"] = datetime.now(timezone.utc)

    try:

        user_id = ObjectId(session["user_id"])

        medical_profiles.update_one(
            {
                "user_id": user_id
            },
            {
                "$set": profile_data,
                "$setOnInsert": {
                    "user_id": user_id,
                    "created_at": datetime.now(timezone.utc)
                }
            },
            upsert=True
        )

        return jsonify({
            "message": "Medical profile updated successfully.",
            "profile": profile_data
        })

    except PyMongoError as e:

        print("Profile update error:", str(e))

        return jsonify({
            "error": "Unable to save medical profile."
        }), 500


# ============================================================
# AI MEDICAL ANALYSIS
# ============================================================

@app.route("/api/analyze", methods=["POST"])
@login_required
def analyze():

    if not ai_configured():

        return jsonify({
            "error": "AI is not configured. Check OPENAI_API_KEY in .env."
        }), 503

    data = request.get_json(silent=True) or {}

    symptoms = (data.get("symptoms") or data.get("description") or "").strip()
    image_data = data.get("image")
    image_mime_type = data.get("image_mime_type") or "image/jpeg"

    if not symptoms and not image_data:
        return jsonify({
            "error": "Please provide symptoms or upload a scene photo."
        }), 400

    try:
        user_content = [
            {
                "role": "system",
                "content": (
                    "You are LifeOS emergency intake AI. "
                    "You are not a doctor and must not provide a diagnosis. "
                    "Only flag an emergency when the information clearly shows an accident, injury, "
                    "medical emergency, or immediate danger involving a person or multiple people. "
                    "If the image or text shows no accident, no injury, no person, or no emergency-related scene, "
                    "you must classify it as low risk and emergency_services as false. "
                    "Do not guess from unrelated objects or harmless scenes. "
                    "If a person is present but not injured and no emergency is visible, return low risk."
                )
            }
        ]

        if symptoms:
            user_content.append({
                "role": "user",
                "content": symptoms
            })

        if image_data:
            user_content.append({
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Review this scene carefully. Determine whether it shows an accident, injury, "
                            "or emergency involving one person or multiple people. If no accident or injury is visible, "
                            "return a low-risk assessment with emergency_services=false."
                        )
                    },
                    {
                        "type": "input_image",
                        "image_url": image_data if image_data.startswith("data:") else f"data:{image_mime_type};base64,{image_data}"
                    }
                ] # type: ignore
            })

        response = openai_client.responses.create(
            model=OPENAI_MODEL,
            input=user_content,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "lifeos_analysis",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {

                            "risk_level": {
                                "type": "string",
                                "enum": [
                                    "low",
                                    "medium",
                                    "high",
                                    "critical"
                                ]
                            },

                            "summary": {
                                "type": "string"
                            },

                            "red_flags": {
                                "type": "array",
                                "items": {
                                    "type": "string"
                                }
                            },

                            "recommended_action": {
                                "type": "string"
                            },

                            "emergency_services": {
                                "type": "boolean"
                            }
                        },

                        "required": [
                            "risk_level",
                            "summary",
                            "red_flags",
                            "recommended_action",
                            "emergency_services"
                        ],

                        "additionalProperties": False
                    }
                }
            }
        )

        parsed = response.output_text

        try:
            analysis = json.loads(parsed)
        except (TypeError, ValueError):
            analysis = {
                "risk_level": "low",
                "summary": str(parsed),
                "red_flags": [],
                "recommended_action": "No emergency detected based on the provided information.",
                "emergency_services": False
            }

        return jsonify(analysis)

    except Exception as e:

        print("AI analysis error:", str(e))

        return jsonify({
            "error": "AI analysis is temporarily unavailable."
        }), 500


# ============================================================
# CREATE EMERGENCY REPORT
# ============================================================

@app.route("/api/reports", methods=["POST"])
@login_required
def create_report():

    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    data = request.get_json(silent=True) or {}
    audio_data_url = data.get("audioDataUrl")
    if not isinstance(audio_data_url, str) or len(audio_data_url) > 2 * 1024 * 1024:
        audio_data_url = None

    report = {
        "user_id": ObjectId(session["user_id"]),
        "type": data.get("emergencyType", data.get("type", "medical")),
        "symptoms": data.get("description", data.get("symptoms", "")),
        "voiceTranscript": data.get("voiceTranscript"),
        "inputMethod": data.get("inputMethod", "typed"),
        "audioDataUrl": audio_data_url,
        "risk_level": data.get("risk_level", ""),
        "location": data.get("location"),
        "locationLabel": data.get("locationLabel"),
        "photoUrl": data.get("photoUrl"),
        "analysis": data.get("analysis"),
        "status": data.get("status", "active"),
        "created_at": datetime.now(timezone.utc)
    }

    try:

        result = reports.insert_one(report)

        report["_id"] = result.inserted_id

        return jsonify({
            "message": "Emergency report saved.",
            "reportId": str(report["_id"]),
            "report": serialize_report(report)
        }), 201

    except PyMongoError as e:

        print("Create report error:", str(e))

        return jsonify({
            "error": "Unable to save emergency report."
        }), 500


# ============================================================
# GET ALL USER REPORTS
# ============================================================

@app.route("/api/reports", methods=["GET"])
@login_required
def get_reports():

    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    try:

        user_id = ObjectId(session["user_id"])

        user_reports = reports.find(
            {
                "user_id": user_id
            }
        ).sort(
            "created_at",
            -1
        )

        result = [
            serialize_report(report)
            for report in user_reports
        ]

        return jsonify({
            "reports": result
        })

    except PyMongoError as e:

        print("Get reports error:", str(e))

        return jsonify({
            "error": "Unable to load reports."
        }), 500


@app.route("/api/authority/reports", methods=["GET"])
@authority_required
def get_authority_reports():
    try:
        authority_reports = reports.find().sort("created_at", -1).limit(200)
        return jsonify({
            "reports": [serialize_report(report) for report in authority_reports]
        })
    except PyMongoError as e:
        print("Get authority reports error:", str(e))
        return jsonify({"error": "Unable to load authority reports."}), 500


@app.route("/api/authority/reports/<report_id>/status", methods=["PATCH"])
@authority_required
def update_authority_report_status(report_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    allowed_statuses = {
        "patient_safe",
        "not_safe",
        "in_danger",
        "about_to_be_in_treatment"
    }

    if status not in allowed_statuses:
        return jsonify({"error": "Choose a valid report status."}), 400

    try:
        result = reports.update_one(
            {"_id": ObjectId(report_id)},
            {"$set": {
                "status": status,
                "patient_details": {
                    "name": str(data.get("patientName", "")).strip()[:120],
                    "condition": str(data.get("patientCondition", "")).strip()[:500],
                    "notes": str(data.get("authorityNotes", "")).strip()[:1000]
                },
                "status_updated_at": datetime.now(timezone.utc)
            }}
        )
        if result.matched_count == 0:
            return jsonify({"error": "Report not found."}), 404
        return jsonify({"message": "Report status updated.", "status": status})
    except (PyMongoError, Exception) as e:
        print("Update authority report status error:", str(e))
        return jsonify({"error": "Unable to update report status."}), 500


# ============================================================
# GET SINGLE REPORT
# ============================================================

@app.route("/api/reports/<report_id>", methods=["GET"])
@login_required
def get_report(report_id):

    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    try:

        report = reports.find_one({
            "_id": ObjectId(report_id),
            "user_id": ObjectId(session["user_id"])
        })

        if not report:

            return jsonify({
                "error": "Report not found."
            }), 404

        return jsonify({
            "report": serialize_report(report)
        })

    except Exception as e:

        print("Get single report error:", str(e))

        return jsonify({
            "error": "Invalid report ID."
        }), 400


# ============================================================
# STATIC FILES
# ============================================================

@app.route("/<path:filename>")
def serve_static(filename):

    # Don't interfere with API routes
    if filename.startswith("api/"):
        return jsonify({
            "error": "API endpoint not found."
        }), 404

    file_path = os.path.join(
        APP_DIRECTORY,
        filename
    )

    if os.path.isfile(file_path):

        return send_from_directory(
            APP_DIRECTORY,
            filename
        )

    return jsonify({
        "error": "File not found."
    }), 404


# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
