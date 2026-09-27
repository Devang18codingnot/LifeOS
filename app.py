import os

"""LifeOS application entry point.

Feature implementations live in backend/modules.
Shared Flask, database, authentication and AI runtime lives in backend/core/runtime.py.
"""

from backend.core.runtime import app

from backend.modules.frontend.routes import bp as frontend_bp
from backend.modules.health.routes import bp as health_bp
from backend.modules.authentication.routes import bp as authentication_bp
from backend.modules.profile.routes import bp as profile_bp
from backend.modules.ai.routes import bp as ai_bp
from backend.modules.reports.routes import bp as reports_bp
from backend.modules.authority.routes import bp as authority_bp

app.register_blueprint(frontend_bp)
app.register_blueprint(health_bp)
app.register_blueprint(authentication_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(authority_bp)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
