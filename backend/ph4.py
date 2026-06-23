"""
Phase 4 — Embeddings  (sentence-transformers → Qdrant)
Phase 5 — Vector Storage, Search & Duplicate Detection  (Qdrant)

Reads from : chunks table  (written by ph3.py)
Writes to  : embeddings_log table  +  Qdrant collection

Index auto-selection:
  ≤ 500 k chunks → Qdrant with exact search
  > 500 k chunks → Qdrant with HNSW approximate search

Install:
    pip install qdrant-client sentence-transformers psycopg2-binary numpy pandas
"""

import json
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values, RealDictCursor

from hf_config import use_hf_token

load_dotenv()
use_hf_token()

# ── Config ───────────────────────────────────────────────────────────────────

DB_URL = os.getenv("DB_URL")
EMBED_MODEL = os.getenv(
    "EMBED_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", 128))
EMBED_MAX_CHARS = int(os.getenv("EMBED_MAX_CHARS", 2000))
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "embeddings")
CHUNK_INDEX_PATH = str(Path(os.getenv("CHUNK_INDEX_PATH", "chunk_index.json")).resolve())
HNSW_THRESHOLD = int(os.getenv("HNSW_THRESHOLD", 500_000))

# Maximum number of Qdrant points to scan for near-duplicate detection in one run.
# Set PH6_MAX_SCAN_POINTS=0 to disable the cap and scan all vectors (may be very slow).
PH6_MAX_SCAN_POINTS = int(os.getenv("PH6_MAX_SCAN_POINTS", "5000"))

logging.basicConfig(
    filename="embedding_errors.log",
    level=logging.WARNING,
    format="%(asctime)s — %(levelname)s — %(message)s",
)

# ── stdout safety ────────────────────────────────────────────────────────────

def _safe_print(*args, sep=" ", end="\n", file=None, flush=False):
    if file is None:
        file = sys.stdout
    text = sep.join(str(a) for a in args) + end
    try:
        file.write(text)
    except Exception:
        sys.__stdout__.buffer.write(text.encode("utf-8", errors="backslashreplace"))
    if flush:
        try: file.flush()
        except Exception: pass

print = _safe_print

# ── DB ────────────────────────────────────────────────────────────────────────

def _conn():
    if not DB_URL:
        raise RuntimeError("DB_URL not set. Please set DB_URL in your .env or environment before running Phase 4.")
    return psycopg2.connect(DB_URL)


def _setup_log_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS embeddings_log (
                chunk_id       TEXT PRIMARY KEY REFERENCES chunks(chunk_id) ON DELETE CASCADE,
                qdrant_point_id INTEGER,
                embedded_at TIMESTAMP DEFAULT NOW()
            );
        """)
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'embeddings_log'
              AND column_name = 'qdrant_point_id'
        """)
        has_qdrant_column = cur.fetchone() is not None

        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'embeddings_log'
              AND column_name = 'faiss_row'
        """)
        if cur.fetchone() is not None:
            cur.execute("ALTER TABLE embeddings_log DROP COLUMN faiss_row")

        if not has_qdrant_column:
            if not has_qdrant_column:
                cur.execute("ALTER TABLE embeddings_log ADD COLUMN qdrant_point_id INTEGER DEFAULT -1 NOT NULL")
    conn.commit()


def _fetch_pending(conn) -> list[dict]:
    """All chunks written by ph3 that are not yet embedded."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT c.chunk_id, c.clean_text
            FROM   chunks c
            LEFT   JOIN embeddings_log el ON c.chunk_id = el.chunk_id
            WHERE  el.chunk_id IS NULL
              AND  c.clean_status = 'SUCCESS'
            ORDER  BY c.chunk_id
        """)
        return cur.fetchall()


def _log(conn, rows: list[tuple]):
    if not rows:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            "INSERT INTO embeddings_log (chunk_id, qdrant_point_id) VALUES %s "
            "ON CONFLICT (chunk_id) DO UPDATE SET qdrant_point_id = EXCLUDED.qdrant_point_id",
            rows,
        )
    conn.commit()

# ── Qdrant index helpers ──────────────────────────────────────────────────────

def _get_qdrant_client():
    """Get or create Qdrant client."""
    from qdrant_client import QdrantClient
    return QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


def _build_collection(client, collection_name: str, vector_size: int, total_chunks: int):
    """
    Create or recreate Qdrant collection with appropriate settings.
    Auto-select index type based on corpus size:
      ≤ HNSW_THRESHOLD → Exact search (smaller datasets)
      >  HNSW_THRESHOLD → HNSW approximate search (scales to millions)
    """
    from qdrant_client.models import Distance, VectorParams, HnswConfigDiff
    
    # Delete existing collection if it exists
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    
    if total_chunks <= HNSW_THRESHOLD:
        print(f"  Index type : Exact search (corpus={total_chunks:,})")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )
    else:
        print(f"  Index type : HNSW approximate search (corpus={total_chunks:,})")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
        )


def _load_collection(client, collection_name: str):
    """Load existing collection and chunk index."""
    try:
        collection_info = client.get_collection(collection_name)
        print(f"  Loaded collection : {collection_info.points_count:,} existing vectors")
    except Exception:
        print("  Collection does not exist — will create new one")
        collection_info = None
    
    if os.path.exists(CHUNK_INDEX_PATH):
        with open(CHUNK_INDEX_PATH, encoding="utf-8") as f:
            chunk_index = json.load(f)
    else:
        chunk_index = []
    return collection_info, chunk_index


def _save_chunk_index(chunk_index: list):
    """Save chunk_id to point_id mapping."""
    with open(CHUNK_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(chunk_index, f)


# ── Phase 4 — Embed & index ──────────────────────────────────────────────────

def run_phase4(model_name: str = EMBED_MODEL) -> int:
    print(f"\n{'='*60}")
    print("  Phase 4 — Embeddings & Qdrant Vector Index")
    print(f"{'='*60}")

    try:
        import torch
        torch.set_num_threads(os.cpu_count() or 4)
    except Exception:
        pass

    from qdrant_client import QdrantClient
    from sentence_transformers import SentenceTransformer

    conn = _conn()
    _setup_log_table(conn)

    pending = _fetch_pending(conn)
    total   = len(pending)
    print(f"  Pending chunks : {total:,}")
    if total == 0:
        print("  Nothing to embed — already up to date.")
        conn.close()
        return 0

    # Load model
    print(f"  Loading model  : {model_name}")
    t0    = time.time()
    model = SentenceTransformer(model_name)
    dim   = model.get_sentence_embedding_dimension()
    print(f"  Model ready    : {time.time()-t0:.1f}s  dim={dim}")

    # Get Qdrant client
    client = _get_qdrant_client()
    
    # Load or create collection
    try:
        collection_info = client.get_collection(QDRANT_COLLECTION)
        print(f"  Loaded collection : {collection_info.points_count:,} existing vectors")
        next_point_id = collection_info.points_count
    except Exception:
        _build_collection(client, QDRANT_COLLECTION, dim, total)
        next_point_id = 0

    if os.path.exists(CHUNK_INDEX_PATH):
        chunk_index = json.load(open(CHUNK_INDEX_PATH, encoding="utf-8"))
    else:
        chunk_index = []

    # Embed and insert batch by batch (Qdrant doesn't need pre-training like IVFFlat)
    t0 = time.time()
    inserted = 0
    log_rows = []

    for start in range(0, total, EMBED_BATCH_SIZE):
        batch = pending[start : start + EMBED_BATCH_SIZE]
        texts = [r["clean_text"][:EMBED_MAX_CHARS] for r in batch]
        ids   = [r["chunk_id"] for r in batch]
        vecs  = model.encode(texts, batch_size=EMBED_BATCH_SIZE,
                             normalize_embeddings=True, convert_to_numpy=True).astype("float32")
        
        # Prepare points for Qdrant
        from qdrant_client.models import PointStruct
        points = []
        for i, (cid, vec) in enumerate(zip(ids, vecs)):
            point_id = next_point_id + i
            points.append(PointStruct(id=point_id, vector=vec.tolist(), payload={"chunk_id": cid}))
            chunk_index.append(cid)
            log_rows.append((cid, point_id))
        
        # Upsert points into Qdrant
        client.upsert(collection_name=QDRANT_COLLECTION, points=points)
        next_point_id += len(batch)
        inserted += len(batch)

        if len(log_rows) >= 1000:
            _log(conn, log_rows)
            log_rows.clear()

        done = min(start + EMBED_BATCH_SIZE, total)
        pct  = done / total * 100
        bar  = "#" * int(pct // 5) + "-" * (20 - int(pct // 5))
        print(f"  [{bar}] {pct:5.1f}%  {done}/{total}", end="\r", flush=True)

    print()
    _log(conn, log_rows)

    _save_chunk_index(chunk_index)
    conn.close()

    # Get final collection stats
    collection_info = client.get_collection(QDRANT_COLLECTION)
    
    print(f"\n{'='*60}")
    print("  Phase 4 Summary")
    print(f"{'='*60}")
    print(f"  Embedded       : {inserted:,} chunks")
    print(f"  Qdrant total   : {collection_info.points_count:,} vectors")
    print(f"  Collection     : {QDRANT_COLLECTION}")
    print(f"  Ready for Phase 5 / 6  (search & duplicate detection)")
    print(f"{'='*60}\nPhase 4 complete")
    return inserted

# ── Phase 5 — Search ─────────────────────────────────────────────────────────
_model_cache: dict = {}

def _get_model(model_name: str):
    if model_name not in _model_cache:
        from sentence_transformers import SentenceTransformer
        _model_cache[model_name] = SentenceTransformer(model_name)
    return _model_cache[model_name]

def search(
    query: str,
    top_k: int = 10,
    model_name: str = EMBED_MODEL,
    # metadata filters (all optional)
    language: str = None, extension: str = None, category: str = None,
    name: str = None, folder: str = None, path: str = None,
    source_archive: str = None,
    created_after: str = None, created_before: str = None,
    modified_after: str = None, modified_before: str = None,
) -> pd.DataFrame:
    """
    Semantic search over the Qdrant collection with optional metadata pre-filtering.
    Reads chunks table (ph3) for metadata; reads Qdrant collection (ph4) for vectors.
    """
    from sentence_transformers import SentenceTransformer
    from qdrant_client import QdrantClient

    client = _get_qdrant_client()
    if os.path.exists(CHUNK_INDEX_PATH):
        chunk_index = json.load(open(CHUNK_INDEX_PATH, encoding="utf-8"))
    else:
        chunk_index = []

    q_vec = _get_model(model_name).encode(
        [query], normalize_embeddings=True, convert_to_numpy=True
    ).astype("float32")[0].tolist()

    # Optional metadata pre-filter via PG
    allowed_ids = None
    filters, params = [], []
    if language:        filters.append("language = %s");        params.append(language)
    if extension:       filters.append("extension = %s");       params.append(extension)
    if category:        filters.append("category = %s");        params.append(category)
    if name:            filters.append("name = %s");            params.append(name)
    if folder:          filters.append("folder = %s");          params.append(folder)
    if path:            filters.append("path = %s");            params.append(path)
    if source_archive:  filters.append("source_archive = %s");  params.append(source_archive)
    if created_after:   filters.append("created_time >= %s");   params.append(created_after)
    if created_before:  filters.append("created_time <= %s");   params.append(created_before)
    if modified_after:  filters.append("modified_time >= %s");  params.append(modified_after)
    if modified_before: filters.append("modified_time <= %s");  params.append(modified_before)

    if filters:
        conn = _conn()
        with conn.cursor() as cur:
            cur.execute(f"SELECT chunk_id FROM chunks WHERE {' AND '.join(filters)}", params)
            allowed_ids = {r[0] for r in cur.fetchall()}
        conn.close()
        if not allowed_ids:
            return pd.DataFrame()

    # Search in Qdrant
    search_k = min(top_k * 20 if allowed_ids else top_k, 100)
    response = client.query_points(
        collection_name=QDRANT_COLLECTION,
        query=q_vec,
        limit=search_k,
    )

    hits = []
    for result in response.points:
        cid = chunk_index[result.id]
        if allowed_ids and cid not in allowed_ids:
            continue
        hits.append((cid, float(result.score)))
        if len(hits) >= top_k:
            break

    if not hits:
        return pd.DataFrame()

    score_map = {cid: s for cid, s in hits}
    conn = _conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM chunks WHERE chunk_id = ANY(%s)", ([h[0] for h in hits],))
        rows = cur.fetchall()
    conn.close()

    df = pd.DataFrame(rows)
    df["score"] = df["chunk_id"].map(score_map)
    return df.sort_values("score", ascending=False).reset_index(drop=True)

# ── Phase 5 — Duplicate helpers (used by ph6) ────────────────────────────────

def find_duplicate_chunks(similarity_threshold: float = 0.95, store: bool = False) -> pd.DataFrame:
    """
    Batch Qdrant search to find near-duplicate chunk pairs.
    Called by ph6 — result feeds into file-level grouping.
    """
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qdrant_models

    client = _get_qdrant_client()
    
    # Load chunk_index or create empty list if file doesn't exist
    if os.path.exists(CHUNK_INDEX_PATH):
        chunk_index = json.load(open(CHUNK_INDEX_PATH, encoding="utf-8"))
    else:
        chunk_index = []
    
    collection_info = client.get_collection(QDRANT_COLLECTION)
    total = collection_info.points_count
    if total == 0:
        return pd.DataFrame(columns=["chunk_id_1", "chunk_id_2", "similarity_score"])

    print(f"  Scanning {total:,} vectors (threshold≥{similarity_threshold}) …")
    
    # Scroll through all points and search neighbors in batches to reduce connection overhead
    pairs: dict[tuple, float] = {}
    
    offset = 0
    scanned = 0
    max_scan = PH6_MAX_SCAN_POINTS if PH6_MAX_SCAN_POINTS > 0 else None
    while True:
        points, offset = client.scroll(
            collection_name=QDRANT_COLLECTION,
            limit=50,
            offset=offset,
            with_vectors=True,
        )
        
        if not points:
            break

        scanned += len(points)
        if max_scan is not None and scanned > max_scan:
            # Trim points to respect the cap and stop after processing this batch
            excess = scanned - max_scan
            if excess >= len(points):
                break
            points = points[: len(points) - excess]
            stop_after = True
        else:
            stop_after = False

        if not points:
            break

        
        requests = [
            qdrant_models.QueryRequest(
                query=qdrant_models.NearestQuery(nearest=point.vector),
                limit=50,
                with_payload=True,
                with_vector=False,
            )
            for point in points
        ]

        responses = client.query_batch_points(
            collection_name=QDRANT_COLLECTION,
            requests=requests,
        )

        for point, response in zip(points, responses):
            a_id = point.id
            # Prefer chunk_id from payload if present (robust to non-contiguous point ids)
            a_cid = None
            if getattr(point, 'payload', None) and isinstance(point.payload, dict):
                a_cid = point.payload.get('chunk_id')
            if a_cid is None:
                try:
                    a_cid = chunk_index[a_id]
                except Exception:
                    # Skip points we cannot map
                    continue

            for result in response.points:
                if result.id <= a_id:  # Avoid duplicate pairs
                    continue
                score = float(result.score)
                if score < similarity_threshold:
                    break
                # Prefer payload mapping for neighbor
                nb_cid = None
                if getattr(result, 'payload', None) and isinstance(result.payload, dict):
                    nb_cid = result.payload.get('chunk_id')
                if nb_cid is None:
                    try:
                        nb_cid = chunk_index[result.id]
                    except Exception:
                        continue
                key = (min(a_cid, nb_cid), max(a_cid, nb_cid))
                if score > pairs.get(key, -1):
                    pairs[key] = score
        if stop_after:
            break
    if not pairs:
        return pd.DataFrame(columns=["chunk_id_1", "chunk_id_2", "similarity_score"])

    df = pd.DataFrame(
        [{"chunk_id_1": k[0], "chunk_id_2": k[1], "similarity_score": v} for k, v in pairs.items()]
    ).sort_values("similarity_score", ascending=False).reset_index(drop=True)

    if store:
        conn = _conn()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS duplicate_chunks (
                    chunk_id_1 TEXT, chunk_id_2 TEXT, similarity FLOAT,
                    detected_at TIMESTAMP DEFAULT NOW(),
                    PRIMARY KEY (chunk_id_1, chunk_id_2)
                );
            """)
            execute_values(
                cur,
                "INSERT INTO duplicate_chunks (chunk_id_1, chunk_id_2, similarity) VALUES %s ON CONFLICT DO NOTHING",
                [(r.chunk_id_1, r.chunk_id_2, r.similarity_score) for r in df.itertuples()],
            )
        conn.commit(); conn.close()

    print(f"  Found {len(df):,} near-duplicate pairs")
    return df


def find_similar_chunks(chunk_id: str, similarity_threshold: float = 0.90, top_k: int = 20) -> pd.DataFrame:
    """Return chunks most similar to a given chunk_id."""
    from qdrant_client import QdrantClient
    
    client = _get_qdrant_client()
    if os.path.exists(CHUNK_INDEX_PATH):
        chunk_index = json.load(open(CHUNK_INDEX_PATH, encoding="utf-8"))
    else:
        chunk_index = []
    
    try:
        anchor_row = chunk_index.index(chunk_id)
    except (ValueError, IndexError):
        return pd.DataFrame()

    # Retrieve the anchor vector
    point = client.retrieve(
        collection_name=QDRANT_COLLECTION,
        ids=[anchor_row],
        with_vectors=True,
    )[0]
    anchor_vec = point.vector

    # Search for similar vectors
    k = min(top_k + 1, 100)
    response = client.query_points(
        collection_name=QDRANT_COLLECTION,
        query=anchor_vec,
        limit=k,
    )

    hits = []
    for result in response.points:
        if result.id == anchor_row:
            continue
        s = float(result.score)
        if s < similarity_threshold:
            break
        hits.append((chunk_index[result.id], s))
        if len(hits) >= top_k:
            break

    if not hits:
        return pd.DataFrame()

    score_map = {cid: s for cid, s in hits}
    conn = _conn()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM chunks WHERE chunk_id = ANY(%s)", ([h[0] for h in hits],))
        rows_pg = cur.fetchall()
    conn.close()

    df = pd.DataFrame(rows_pg)
    df["similarity_score"] = df["chunk_id"].map(score_map)
    return df.sort_values("similarity_score", ascending=False).reset_index(drop=True)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_phase4()