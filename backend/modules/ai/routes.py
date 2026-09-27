from flask import Blueprint, jsonify, request, session
import json
from backend.core.runtime import *

bp = Blueprint("ai", __name__)
# ============================================================
# AI MEDICAL ANALYSIS
# ============================================================

@bp.route("/api/analyze", methods=["POST"])
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



