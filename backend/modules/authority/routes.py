from flask import Blueprint, jsonify, request
from datetime import datetime, timezone
from pymongo.errors import PyMongoError
from bson import ObjectId
from backend.core.runtime import *

bp = Blueprint("authority", __name__)
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



