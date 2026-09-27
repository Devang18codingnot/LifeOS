from flask import Blueprint, jsonify, request, session
from datetime import datetime, timezone
from pymongo.errors import PyMongoError
from bson import ObjectId
from backend.core.runtime import *

bp = Blueprint("reports", __name__)
# ============================================================
# CREATE EMERGENCY REPORT
# ============================================================

@bp.route("/api/reports", methods=["POST"])
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

@bp.route("/api/reports", methods=["GET"])
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


@bp.route("/api/reports/<report_id>/patient-details", methods=["GET"])
@login_required
def get_report_patient_details(report_id):
    if not database_configured():
        return jsonify({
            "error": "Database is not configured. Check MONGODB_URI in .env."
        }), 503

    try:
        report = reports.find_one({"_id": ObjectId(report_id)})
    except (PyMongoError, TypeError, ValueError):
        return jsonify({"error": "Invalid report id."}), 400

    if not report:
        return jsonify({"error": "Report not found."}), 404

    current_user = get_session_user()
    if not can_access_patient_details(report, current_user):
        return jsonify({
            "error": "You are not authorized to view patient details for this report."
        }), 403

    return jsonify({
        "report_id": str(report.get("_id")),
        "patient_details": report.get("patient_details") or {}
    })


@bp.route("/api/authority/reports", methods=["GET"])
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


@bp.route("/api/authority/reports/<report_id>/status", methods=["PATCH"])
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

@bp.route("/api/reports/<report_id>", methods=["GET"])
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



