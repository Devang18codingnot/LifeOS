from flask import Blueprint, redirect, send_from_directory
from backend.core.runtime import app, APP_DIRECTORY, authority_required

bp = Blueprint("frontend", __name__)

@app.route("/")
def home():
    if "user_id" not in session:
        return redirect("/login")
    return send_from_directory(APP_DIRECTORY, "index.html")

@app.route("/login")
def login_page():
    if "user_id" in session:
        return redirect("/")
    return send_from_directory(APP_DIRECTORY, "login.html")

@app.route("/authority/login")
def authority_login_page():
    return send_from_directory(APP_DIRECTORY, "authority-login.html")

@app.route("/authority")
@authority_required
def authority_page():
    return send_from_directory(APP_DIRECTORY, "authority.html")
