"""
app.py — Single entry point for the entire RAG chatbot pipeline
Combines all phases (1-13) into one application.

Phases breakdown:
  - ph1: File indexing (crawl filesystem, compute hashes)
  - ph2: Content extraction (text/metadata from files)
  - ph3: Chunking (break content into embeddings-friendly pieces)
  - ph4: Qdrant embeddings + search (vectorize chunks, build vector index)
  - ph5: ?
  - ph6: Duplicate detection (file_redundancy)
  - ph7: Scoring (9 signals -> importance_score + label)
  - ph8: ?
  - ph9: Explanations (SHAP + LLM plain-language why)
  - ph10-12: ?
  - ph13: FastAPI chatbot server (the main API)

RUN:
    # Make sure .env is set with DB_URL, GROQ_API_KEY, etc.
    python app.py

THEN:
    - Backend runs at http://127.0.0.1:8013
    - Frontend at http://127.0.0.1:5173 (run 'npm run dev' in separate terminal)
    - Chat link lives in the dashboard, not as a standalone page
"""

import os
import sys
import logging

# Add backend folder to path so we can import phases
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] [%(levelname)s] %(message)s"
)
log = logging.getLogger("app")

def run_pipeline():
    """
    Single entry point: starts the FastAPI server (ph10) which orchestrates
    all phases on-demand for chat requests.
    """
    log.info("=" * 70)
    log.info("Phase 13 — RAG Chatbot Pipeline")
    log.info("=" * 70)
    log.info("")

    # Check for required env vars
    db_url = os.getenv("DATABASE_URL") or os.getenv("DB_URL")
    groq_key = os.getenv("GROQ_API_KEY")

    if not db_url:
        log.warning("⚠️  DATABASE_URL (or DB_URL) not set in .env")
        log.warning("   Chat will still run, but no persistence.")

    if not groq_key:
        log.warning("⚠️  GROQ_API_KEY not set in .env")
        log.warning("   Chat will fail. Set it before making requests.")

    log.info("")
    log.info("Starting FastAPI server...")
    log.info("→ http://127.0.0.1:8013/health")
    log.info("")
    log.info("For the dashboard:")
    log.info("   1. In another terminal: cd frontend/file-cleanup-dashboard")
    log.info("   2. npm run dev")
    log.info("")
    log.info("Chat lives in the dashboard, NOT as a standalone page.")
    log.info("=" * 70)
    log.info("")

    # Import and run ph10 (the FastAPI app)
    from ph10 import app
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.getenv("PH13_PORT", 8013)),
        log_level="info",
    )


if __name__ == "__main__":
    run_pipeline()
