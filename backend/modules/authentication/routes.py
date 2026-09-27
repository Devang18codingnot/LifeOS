from flask import Blueprint, jsonify, request, session
from datetime import datetime, timezone
from pymongo.errors import PyMongoError, DuplicateKeyError
from werkzeug.security import generate_password_hash, check_password_hash
import hmac
from bson import ObjectId
from backend.core.runtime import *

bp = Blueprint("authentication", __name__)

# ============================================================
# REGISTER
# ============================================================

@bp.route("/api/auth/register", methods=["POST"])
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

@bp.route("/api/auth/login", methods=["POST"])
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

@bp.route("/api/auth/me", methods=["GET"])
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

@bp.route("/api/auth/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "message": "Logged out successfully."
    })




# ============================================================
# LOGIN
# ============================================================

@bp.route("/api/auth/login", methods=["POST"])
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

@bp.route("/api/auth/me", methods=["GET"])
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

@bp.route("/api/auth/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "message": "Logged out successfully."
    })



