"""
Crest AI — FastAPI backend.

Run with:
  cd backend
  .venv/bin/uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from backend directory
load_dotenv(Path(__file__).parent / ".env")

from routers.analyze import router as analyze_router  # noqa: E402
from routers.chat import router as chat_router  # noqa: E402
from routers.fetch import router as fetch_router  # noqa: E402

app = FastAPI(
    title="Crest AI",
    description="SOTA pre-publish AEO optimization pipeline",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router, prefix="/api/v1", tags=["analyze"])
app.include_router(fetch_router, prefix="/api/v1", tags=["fetch"])
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])


@app.get("/")
def root() -> dict:
    return {"service": "Crest AI", "version": "1.0.0", "docs": "/docs"}
