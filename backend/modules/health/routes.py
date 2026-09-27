from flask import Blueprint, jsonify
from backend.core.runtime import MONGODB_URI, client, DATABASE_NAME, openai_client

bp = Blueprint("health", __name__)

@bp.route("/api/health", methods=["GET"])
def health():
    database_status = "not_configured"
    if MONGODB_URI:
        if client:
            try:
                client.admin.command("ping")
                database_status = "connected"
            except Exception:
                database_status = "unavailable"
        else:
            database_status = "unavailable"
    return jsonify({"status":"ok","database":database_status,"database_name":DATABASE_NAME,"ai":"configured" if openai_client else "not_configured"})
