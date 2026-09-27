from flask import Blueprint, jsonify, request, session
from datetime import datetime, timezone
from pymongo.errors import PyMongoError
from bson import ObjectId
from backend.core.runtime import *

bp = Blueprint("profile", __name__)
# ============================================================
# MEDICAL PROFILE - GET
# ============================================================

@bp.route("/api/profile", methods=["GET"])
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

@bp.route("/api/profile", methods=["PUT"])
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



