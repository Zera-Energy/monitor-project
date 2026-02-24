# app/core/cors.py
from fastapi.middleware.cors import CORSMiddleware
from .config import ALLOWED_ORIGINS

def setup_cors(app):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],  # Authorization 포함
    )