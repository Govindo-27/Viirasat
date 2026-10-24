"""
Virasat - Cultural Heritage Archive
Main Flask Application Entry Point

Run locally on Windows with:
    python app.py
"""
import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from backend.routes import api_bp
from backend.storage import ensure_storage_exists

app = Flask(__name__, static_folder="dist", static_url_path="")
CORS(app)

# Register API Blueprint
app.register_blueprint(api_bp)

# Static files route for production / built frontend
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    dist_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
    if path != "" and os.path.exists(os.path.join(dist_dir, path)):
        return send_from_directory(dist_dir, path)
    if os.path.exists(os.path.join(dist_dir, "index.html")):
        return send_from_directory(dist_dir, "index.html")
    return {
        "app": "Virasat Cultural Heritage Archive",
        "tagline": "Every tradition deserves a tomorrow.",
        "status": "Flask API is running. To serve the frontend, build with 'npm run build' or run Vite dev server.",
        "apiEndpoints": [
            "/api/status",
            "/api/contributions",
            "/api/curate",
            "/api/ask",
            "/api/config"
        ]
    }


if __name__ == "__main__":
    ensure_storage_exists()
    port = int(os.environ.get("FLASK_PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    print("=" * 60)
    print("🏛️  VIRASAT — AI-Powered Cultural Heritage Archive")
    print("    'Every tradition deserves a tomorrow.'")
    print(f"    Server starting at: http://127.0.0.1:{port}")
    print("=" * 60)
    app.run(host="127.0.0.1", port=port, debug=debug)
