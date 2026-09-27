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


def get_session_user():
    if "user_id" not in session:
        return None

    user_id = session["user_id"]
    if not user_id:
        return None

    try:
        return users.find_one({"_id": ObjectId(user_id)}, {"email": 1})
    except (TypeError, ValueError, PyMongoError, Exception):
        return None


def can_access_patient_details(report, current_user):
    if not report or not current_user:
        return False

    current_email = (current_user.get("email") or "").lower()
    if current_email in AUTHORITY_EMAILS:
        return True

    report_user_id = report.get("user_id")
    if not report_user_id:
        return False

    try:
        return str(report_user_id) == str(ObjectId(session["user_id"]))
    except (TypeError, ValueError, KeyError):
        return False


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


