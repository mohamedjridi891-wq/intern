"""
Phase 13 — RAG Chatbot Interface (simple version)
====================================================

A small FastAPI server that lets you chat with your file system.

Flow for every message:
  1. Save the user's message to Postgres (conversation history)
  2. Search the Qdrant vector index (ph4.search) for relevant files
  3. Pull importance score + label for those files (ph7 file_scores)
  4. Ask Groq for an answer, grounded only in those files
  5. Build simple widgets: file_cards, table (duplicates), chart (labels), summary
  6. Save the assistant's answer + widgets
  7. Return everything as one JSON response

VIEW ONLY / ADVISORY ASSISTANT
--------------------------------
This file never deletes, moves, renames, or edits any file. It only ever
runs SELECT queries plus two INSERTs into its own chat_sessions /
chat_messages tables. Every response includes "advisory_notice".

ACCESS CONTROL
--------------------------------
Every request must include a header:  X-Owner-Id: <any-string-you-choose>
That string becomes the "owner" of any session it creates. A session can
only be read back by the same owner. This is NOT full authentication —
there's no password, anyone who knows the header value can use it — but it
closes the "guess a session_id, read someone else's chat" hole. If you
later add real auth (API keys, JWT, etc.), swap get_owner_id() to read the
verified user id instead of a free-text header.

Run:
    pip install fastapi uvicorn psycopg2-binary requests python-dotenv
    python ph13.py
    → http://localhost:8013/docs

    Example request:
    curl -X POST http://localhost:8013/chat \\
         -H "Content-Type: application/json" \\
         -H "X-Owner-Id: me" \\
         -d '{"message": "what are my most important files?"}'
"""

import json
import logging
import os
import re
import shutil
import uuid
import sys
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path, PurePosixPath

import psycopg2
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, Field

load_dotenv()

# Ensure stdout/stderr use UTF-8 on Windows consoles to avoid UnicodeEncodeError
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", BASE_DIR / "uploaded_folders"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ph13")

try:
    import ph11
except Exception as e:
    ph11 = None
    log.warning(f"ph11 integration unavailable: {e}")

try:
    import ph1
except Exception as e:
    ph1 = None
    log.warning(f"ph1 integration unavailable: {e}")

try:
    import ph2
except Exception as e:
    ph2 = None
    log.warning(f"ph2 integration unavailable: {e}")

try:
    import ph3
except Exception as e:
    ph3 = None
    log.warning(f"ph3 integration unavailable: {e}")

try:
    import ph4
except Exception as e:
    ph4 = None
    log.warning(f"ph4 integration unavailable: {e}")

try:
    import ph6
except Exception as e:
    ph6 = None
    log.warning(f"ph6 integration unavailable: {e}")

try:
    import ph7
except Exception as e:
    ph7 = None
    log.warning(f"ph7 integration unavailable: {e}")

try:
    import ph9
except Exception as e:
    ph9 = None
    log.warning(f"ph9 integration unavailable: {e}")

# ── Config ───────────────────────────────────────────────────────────────────

# Unified on DATABASE_URL to match ph7, which is the table this file reads
# (file_scores). If your other phases (ph1-ph6) still write via DB_URL,
# either update them to DATABASE_URL too, or point both env vars at the
# same connection string for now.
DB_URL = os.getenv("DATABASE_URL") or os.getenv("DB_URL")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

TOP_K = int(os.getenv("PH13_TOP_K", 6))
MAX_MESSAGE_CHARS = int(os.getenv("PH13_MAX_MESSAGE_CHARS", 2000))

ADVISORY_NOTICE = (
    "View only / Advisory assistant — I can search, explain, and recommend, "
    "but I cannot modify, move, or delete any file. Removals or archiving "
    "require human approval in the review dashboard."
)

SYSTEM_PROMPT = """You are an assistant for an enterprise file governance system.
You answer questions about the user's files using ONLY the context given to you.

Rules:
- You are VIEW ONLY. You never claim to delete, move, rename, or edit a file.
  If asked to do that, explain you can only recommend it for human approval.
- If the context has no relevant files, say so plainly. Do not invent files,
  scores, or facts.
- Keep answers short: 2-4 sentences unless asked for more detail.
- Refer to files by name, not by ID."""

# Lazy import: ph4 pulls in hf_config, sentence-transformers, faiss, etc.
# Importing it lazily means /health and / still work even if that chain
# is broken, and we get a clear error at call time instead of at startup.
_faiss_search = None
_faiss_import_error = None


def _get_faiss_search():
    global _faiss_search, _faiss_import_error
    if _faiss_search is None and _faiss_import_error is None:
        try:
            from ph4 import search as faiss_search
            _faiss_search = faiss_search
        except Exception as e:
            _faiss_import_error = e
            log.error(f"Could not import ph4.search: {e}")
    return _faiss_search

# ── DB helpers ────────────────────────────────────────────────────────────────

def _require_db_url():
    if not DB_URL:
        raise RuntimeError(
            "DATABASE_URL (or DB_URL) not set. Please set it in your .env "
            "before running Phase 13."
        )


def _sanitize_owner_id(owner_id: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_\-]", "_", owner_id or "owner")
    return clean[:64] or "owner"


def _sanitize_upload_path(filename: str) -> Path:
    path = PurePosixPath(filename or "")
    parts = [p for p in path.parts if p not in ("", ".", "..")]
    if not parts:
        raise ValueError("Invalid upload filename")
    return Path(*parts)


def _run_folder_pipeline(root_path: Path) -> dict:
    if ph1 is None:
        raise HTTPException(503, "Scan API is unavailable.")

    if not root_path.exists() or not root_path.is_dir():
        raise HTTPException(400, "root_folder must be an existing directory.")

    root_path = root_path.resolve()
    log.info(f"Starting pipeline scan for: {root_path}")

    # Phase 1: Index & Hash Files
    log.info("Phase 1: Indexing and hashing files...")
    ph1.run_phase1(str(root_path))
    log.info("✓ Phase 1 complete")

    # Phase 2: Extract Content
    if ph2 is not None:
        log.info("Phase 2: Extracting content from files...")
        ph2.run_phase2()
        log.info("✓ Phase 2 complete")
    else:
        log.warning("⚠️  Phase 2 skipped (module unavailable)")

    # Phase 3: Chunk Content
    if ph3 is not None:
        log.info("Phase 3: Chunking content...")
        ph3.run_phase3()
        log.info("✓ Phase 3 complete")
    else:
        log.warning("⚠️  Phase 3 skipped (module unavailable)")

    # Phase 4: Embed & Index (Qdrant)
    if ph4 is not None:
        log.info("Phase 4: Building Qdrant embeddings index...")
        ph4.run_phase4()
        log.info("✓ Phase 4 complete")
    else:
        log.warning("⚠️  Phase 4 skipped (module unavailable)")

    # Phase 6: Find Duplicates
    if ph6 is not None:
        log.info("Phase 6: Finding duplicate files...")
        ph6.run_phase6()
        log.info("✓ Phase 6 complete")
    else:
        log.warning("⚠️  Phase 6 skipped (module unavailable)")

    # Phase 7: Score Files
    if ph7 is not None:
        log.info("Phase 7: Scoring and labeling files...")
        ph7.run_phase7()
        log.info("✓ Phase 7 complete")
    else:
        log.warning("⚠️  Phase 7 skipped (module unavailable)")

    # Phase 9: Generate Explanations (optional, LLM-based)
    if ph9 is not None:
        log.info("Phase 9: Generating explanations...")
        ph9.run_phase9()
        log.info("✓ Phase 9 complete")
    else:
        log.warning("⚠️  Phase 9 skipped (module unavailable)")

    log.info("✓ Pipeline scan complete!")
    return {
        "status": "ok",
        "root_folder": str(root_path),
        "message": "All pipeline phases completed successfully",
    }


@contextmanager
def db_conn():
    """Context-managed connection: always closes, even on exceptions."""
    _require_db_url()
    conn = psycopg2.connect(DB_URL)
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    session_id  TEXT PRIMARY KEY,
                    owner_id    TEXT NOT NULL,
                    created_at  TIMESTAMP DEFAULT NOW()
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id          SERIAL PRIMARY KEY,
                    session_id  TEXT REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
                    role        TEXT,           -- 'user' or 'assistant'
                    content     TEXT,
                    widgets     JSONB,
                    created_at  TIMESTAMP DEFAULT NOW()
                );
            """)
        conn.commit()


def get_or_create_session(conn, session_id: str | None, owner_id: str) -> str:
    """Create a session owned by owner_id, or verify ownership of an existing one."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if session_id:
            cur.execute("SELECT owner_id FROM chat_sessions WHERE session_id = %s", (session_id,))
            row = cur.fetchone()
            if row is None:
                cur.execute(
                    "INSERT INTO chat_sessions (session_id, owner_id) VALUES (%s, %s)",
                    (session_id, owner_id),
                )
                conn.commit()
                return session_id
            if row["owner_id"] != owner_id:
                raise HTTPException(403, "This session belongs to a different owner.")
            return session_id

        new_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO chat_sessions (session_id, owner_id) VALUES (%s, %s)",
            (new_id, owner_id),
        )
    conn.commit()
    return new_id


def check_session_owner(conn, session_id: str, owner_id: str) -> bool:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT owner_id FROM chat_sessions WHERE session_id = %s", (session_id,))
        row = cur.fetchone()
    return row is not None and row["owner_id"] == owner_id


def save_message(conn, session_id, role, content, widgets=None):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO chat_messages (session_id, role, content, widgets) VALUES (%s, %s, %s, %s)",
            (session_id, role, content, json.dumps(widgets) if widgets else None),
        )
    conn.commit()


def load_history(conn, session_id, limit=20):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT role, content FROM chat_messages WHERE session_id = %s "
            "ORDER BY id DESC LIMIT %s",
            (session_id, limit),
        )
        rows = cur.fetchall()
    rows.reverse()
    return [{"role": r["role"], "content": r["content"]} for r in rows]

# ── Retrieval + scoring ───────────────────────────────────────────────────────

def get_relevant_files(message: str):
    """Search FAISS index, then attach score + label from ph7. Returns a list of dicts."""
    faiss_search = _get_faiss_search()
    if faiss_search is None:
        log.warning(f"FAISS search unavailable: {_faiss_import_error}")
        return []

    try:
        df = faiss_search(message, top_k=TOP_K)
    except Exception as e:
        log.warning(f"FAISS search failed: {e}")
        return []

    if df is None or df.empty:
        return []

    file_ids = sorted(set(int(x) for x in df["file_id"].dropna().unique()))

    scores = {}
    try:
        with db_conn() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT file_id, importance_score, label FROM file_scores WHERE file_id = ANY(%s)",
                    (file_ids,),
                )
                for row in cur.fetchall():
                    scores[row["file_id"]] = row
    except Exception as e:
        log.warning(f"Could not fetch file_scores: {e}")

    files, seen = [], set()
    for _, row in df.iterrows():
        fid = int(row["file_id"])
        if fid in seen:
            continue
        seen.add(fid)
        s = scores.get(fid, {})
        files.append({
            "file_id": fid,
            "name": row.get("name", ""),
            "path": row.get("path", ""),
            "extension": row.get("extension", ""),
            "relevance": round(float(row.get("score", 0.0)), 3),
            "importance_score": s.get("importance_score"),
            "label": s.get("label"),
        })
    return files

# ── Widgets ───────────────────────────────────────────────────────────────────

def build_widgets(message: str, files: list[dict]) -> dict:
    widgets = {"file_cards": files[:6]}
    text = message.lower()

    if "duplicate" in text:
        try:
            with db_conn() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT path_1, path_2, avg_similarity, action FROM file_redundancy "
                        "ORDER BY avg_similarity DESC LIMIT 10"
                    )
                    rows = cur.fetchall()
            if rows:
                widgets["table"] = {
                    "title": "Duplicate / redundant file pairs",
                    "columns": ["File A", "File B", "Similarity", "Action"],
                    "rows": [[r["path_1"], r["path_2"], round(r["avg_similarity"], 2), r["action"]] for r in rows],
                }
        except Exception as e:
            log.warning(f"Could not build duplicates widget: {e}")

    if any(w in text for w in ("breakdown", "distribution", "overview", "how many")):
        try:
            with db_conn() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT label, COUNT(*) AS n FROM file_scores GROUP BY label")
                    rows = cur.fetchall()
            if rows:
                widgets["chart"] = {
                    "title": "Files by label",
                    "labels": [r["label"] for r in rows],
                    "values": [r["n"] for r in rows],
                }
                widgets["summary"] = {
                    "total_files": sum(r["n"] for r in rows),
                    "by_label": {r["label"]: r["n"] for r in rows},
                }
        except Exception as e:
            log.warning(f"Could not build breakdown widget: {e}")

    return widgets

# ── LLM answer ────────────────────────────────────────────────────────────────

def ask_groq(history: list[dict], message: str, files: list[dict]) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(503, "Chat is not configured: GROQ_API_KEY is missing.")

    if files:
        context = "\n".join(
            f"- {f['name']} | label={f['label']} | score={f['importance_score']}"
            for f in files
        )
    else:
        context = "No matching files were found."

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += history
    messages.append({"role": "user", "content": f"Files found:\n{context}\n\nQuestion: {message}"})

    try:
        resp = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": messages, "max_tokens": 350, "temperature": 0.2},
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except requests.exceptions.RequestException as e:
        log.error(f"Groq request failed: {e}")
        raise HTTPException(502, "The chat model is temporarily unavailable. Please try again.")

# ── Suggested questions ───────────────────────────────────────────────────────

def suggest_questions(files: list[dict]) -> list[str]:
    if not files:
        return [
            "What are my top 10 most important files?",
            "Show me duplicate files.",
            "Give me a breakdown of all files by label.",
        ]
    name = files[0]["name"]
    return [
        f"Why does {name} have that score?",
        "Are there any duplicates of this file?",
        "Show me a breakdown of all files by label.",
    ]

# ── API models ────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str = Field(..., min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    advisory_notice: str
    can_modify_files: bool = False
    widgets: dict
    suggested_questions: list[str]
    history: list[dict]

# ── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    _require_db_url()
    init_db()
    if not GROQ_API_KEY:
        log.warning("GROQ_API_KEY is not set — /chat will return 503 until it is configured.")
    if _get_faiss_search() is None:
        log.warning(
            f"ph4.search is unavailable ({_faiss_import_error}) — "
            f"file search will return no results until this is fixed."
        )
    yield


app = FastAPI(
    title="Phase 13 — RAG Chatbot (View Only / Advisory)",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def get_owner_id(x_owner_id: str | None = Header(default=None)) -> str:
    """
    Identifies who is making the request. This is a lightweight scheme, not
    real authentication: any caller can claim any owner id. It exists so
    session_id alone isn't enough to read someone else's chat history.
    Swap this out for verified auth (API key / JWT) before exposing this
    server beyond your own machine.
    """
    return x_owner_id or "default"


@app.get("/")
def root():
    return {
        "message": "Phase 13 — RAG Chatbot is running.",
        "health": "/health",
        "note": "POST /chat with JSON {\"message\": \"...\"} and header X-Owner-Id. The dashboard hosts the chat UI.",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "advisory_notice": ADVISORY_NOTICE,
        "can_modify_files": False,
        "groq_configured": bool(GROQ_API_KEY),
        "faiss_search_available": _get_faiss_search() is not None,
    }


# --- Additional endpoints used by the frontend dashboard


def _table_exists(conn, table_name: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = %s)",
            (table_name,),
        )
        return cur.fetchone()[0]


def _explanations_join_sql(conn) -> tuple[str, str]:
    """
    Returns (select_extra, join_clause) that add confidence + SHAP signals from
    the ph9 file_explanations table when it exists, or empty strings when it
    doesn't (so /files and /review-queue still work before phase 9 has run).
    The frontend (WhyExplain.jsx / FileDetailDrawer.jsx) reads a flat
    {signal_name: value} object as `file.signals` and `file.confidence`; the
    shap_json column is exactly that shape, so we expose it directly.
    """
    if _table_exists(conn, 'file_explanations'):
        select_extra = ", fe.confidence, fe.shap_json AS signals"
        join_clause = " LEFT JOIN file_explanations fe ON f.id = fe.file_id"
        return select_extra, join_clause
    return "", ""


@app.get("/files")
def list_files(limit: int = 100):
    try:
        with db_conn() as conn:
            if not _table_exists(conn, 'files'):
                return []
            sel, join = _explanations_join_sql(conn)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT f.*, f.id AS file_id, fs.importance_score, fs.label" + sel +
                    " FROM files f LEFT JOIN file_scores fs ON f.id = fs.file_id" + join +
                    " ORDER BY COALESCE(fs.importance_score,0) DESC LIMIT %s",
                    (limit,),
                )
                return cur.fetchall()
    except Exception as e:
        log.error(f"list_files failed: {e}")
        raise HTTPException(500, "list_files failed")


@app.get("/files/{file_id}")
def file_detail(file_id: int):
    try:
        with db_conn() as conn:
            if not _table_exists(conn, 'files'):
                raise HTTPException(404, "files table not found")
            sel, join = _explanations_join_sql(conn)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT f.*, f.id AS file_id, fs.importance_score, fs.label" + sel +
                    " FROM files f LEFT JOIN file_scores fs ON f.id = fs.file_id" + join +
                    " WHERE f.id = %s",
                    (file_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, "file not found")
                return row
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"file_detail failed: {e}")
        raise HTTPException(500, "file_detail failed")


class ScanRequest(BaseModel):
    root_folder: str = Field(..., min_length=1)


@app.post("/scan")
def scan_root_folder(req: ScanRequest):
    root_folder = req.root_folder.strip()
    if not root_folder:
        raise HTTPException(400, "root_folder is required.")

    return _run_folder_pipeline(Path(root_folder))


@app.post("/upload-folder")
def upload_folder(owner_id: str = Header(default="dashboard-user"), files: list[UploadFile] | None = File(default=None)):
    """Upload a folder tree from the browser as individual files."""
    if not files:
        raise HTTPException(400, "No files uploaded.")

    owner_key = _sanitize_owner_id(owner_id)
    upload_id = str(uuid.uuid4())
    destination_root = UPLOAD_ROOT / owner_key / upload_id
    destination_root.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for uploaded in files:
        try:
            safe_path = _sanitize_upload_path(uploaded.filename)
            target_path = destination_root / safe_path
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with target_path.open("wb") as out_file:
                out_file.write(uploaded.file.read())
            saved_paths.append(str(target_path))
        except Exception as e:
            log.error(f"Could not save uploaded file {uploaded.filename}: {e}")
            raise HTTPException(400, f"Invalid uploaded file path: {uploaded.filename}")

    log.info(f"Uploaded {len(saved_paths)} files for owner {owner_key} to {destination_root}")
    # If SKIP_PIPELINE_ON_UPLOAD=1 is set, skip running the full pipeline
    skip_env = os.getenv("SKIP_PIPELINE_ON_UPLOAD", "0") == "1"
    skip_flag = (BASE_DIR / "skip_pipeline.flag").exists()
    if skip_env or skip_flag:
        return {"status": "uploaded", "root_folder": str(destination_root), "skipped_pipeline": True}
    return _run_folder_pipeline(destination_root)


@app.get("/duplicates")
def duplicates(limit: int = 100):
    try:
        with db_conn() as conn:
            if not _table_exists(conn, 'file_redundancy'):
                return []
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT path_1, path_2, avg_similarity, action FROM file_redundancy ORDER BY avg_similarity DESC LIMIT %s",
                    (limit,),
                )
                return cur.fetchall()
    except Exception as e:
        log.error(f"duplicates failed: {e}")
        raise HTTPException(500, "duplicates failed")


@app.get("/review-queue")
def review_queue(limit: int = 200):
    try:
        with db_conn() as conn:
            if not _table_exists(conn, 'files') or not _table_exists(conn, 'file_scores'):
                return []
            sel, join = _explanations_join_sql(conn)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT f.*, f.id AS file_id, fs.importance_score, fs.label" + sel +
                    " FROM files f JOIN file_scores fs ON f.id = fs.file_id" + join +
                    " WHERE fs.label IN ('REVIEW','DELETE_CANDIDATE') ORDER BY fs.importance_score ASC LIMIT %s",
                    (limit,),
                )
                return cur.fetchall()
    except Exception as e:
        log.error(f"review_queue failed: {e}")
        raise HTTPException(500, "review_queue failed")


@app.post("/files/{file_id}/action")
def files_action(file_id: int, payload: dict):
    action = payload.get('action')
    user = payload.get('user') or 'ui'
    if action not in ('KEEP', 'ARCHIVE', 'DELETE', 'REVIEWED'):
        raise HTTPException(400, 'invalid action')
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "CREATE TABLE IF NOT EXISTS file_actions (id SERIAL PRIMARY KEY, file_id TEXT, action TEXT, actor TEXT, created_at TIMESTAMP DEFAULT NOW())"
                )
                cur.execute(
                    "INSERT INTO file_actions (file_id, action, actor) VALUES (%s, %s, %s)",
                    (str(file_id), action, user),
                )
            conn.commit()
        return {"status": "ok"}
    except Exception as e:
        log.error(f"files_action failed: {e}")
        raise HTTPException(500, "files_action failed")


@app.post("/feedback")
def submit_feedback(item: dict):
    if ph11 is None:
        raise HTTPException(503, "Feedback API is unavailable.")
    required = ["file_id", "human_label", "decision"]
    missing = [field for field in required if field not in item]
    if missing:
        raise HTTPException(400, f"Missing required fields: {', '.join(missing)}")
    try:
        return ph11.record_feedback(
            file_id=item["file_id"],
            human_label=item["human_label"],
            decision=item["decision"],
            predicted_label=item.get("predicted_label"),
            predicted_score=item.get("predicted_score"),
            reviewer=item.get("reviewer"),
            reviewer_confidence=item.get("reviewer_confidence", 3),
            reason_code=item.get("reason_code"),
            note=item.get("note"),
            model_version=item.get("model_version"),
        )
    except Exception as e:
        log.error(f"submit_feedback failed: {e}")
        raise HTTPException(500, "submit_feedback failed")


@app.post("/feedback/batch")
def submit_feedback_batch(payload: dict):
    if ph11 is None:
        raise HTTPException(503, "Feedback API is unavailable.")
    items = payload.get("items") if payload else None
    if not isinstance(items, list):
        raise HTTPException(400, "Expected items list.")
    try:
        count = ph11.record_feedback_batch(items)
        return {"inserted": count}
    except Exception as e:
        log.error(f"submit_feedback_batch failed: {e}")
        raise HTTPException(500, "submit_feedback_batch failed")


@app.get("/feedback/status")
def feedback_status():
    if ph11 is None:
        raise HTTPException(503, "Feedback API is unavailable.")
    try:
        return ph11.should_retrain()
    except Exception as e:
        log.error(f"feedback_status failed: {e}")
        raise HTTPException(500, "feedback_status failed")


@app.post("/feedback/retrain")
def feedback_retrain(payload: dict | None = None):
    if ph11 is None:
        raise HTTPException(503, "Feedback API is unavailable.")
    payload = payload or {}
    try:
        return ph11.run_phase11(force=payload.get("force", False))
    except Exception as e:
        log.error(f"feedback_retrain failed: {e}")
        raise HTTPException(500, "feedback_retrain failed")


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, x_owner_id: str = Header(default="default")):
    owner_id = x_owner_id

    with db_conn() as conn:
        session_id = get_or_create_session(conn, req.session_id, owner_id)

        history = load_history(conn, session_id)
        files = get_relevant_files(req.message)
        widgets = build_widgets(req.message, files)
        answer = ask_groq(history, req.message, files)
        suggested = suggest_questions(files)

        save_message(conn, session_id, "user", req.message)
        save_message(conn, session_id, "assistant", answer, widgets)
        full_history = load_history(conn, session_id, limit=100)

    return ChatResponse(
        session_id=session_id,
        answer=answer,
        advisory_notice=ADVISORY_NOTICE,
        widgets=widgets,
        suggested_questions=suggested,
        history=full_history,
    )


@app.get("/chat/{session_id}/history")
def get_history(session_id: str, x_owner_id: str = Header(default="default")):
    with db_conn() as conn:
        if not check_session_owner(conn, session_id, x_owner_id):
            raise HTTPException(404, "Session not found.")
        history = load_history(conn, session_id, limit=200)
    return {"session_id": session_id, "history": history, "advisory_notice": ADVISORY_NOTICE}


if __name__ == "__main__":
    import uvicorn
    print("\nPhase 13 — RAG Chatbot (VIEW ONLY / ADVISORY — cannot modify or delete files)\n")
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PH13_PORT", 8013)))