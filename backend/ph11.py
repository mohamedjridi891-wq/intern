"""
Phase 11 — Feedback and Continuous Learning
=============================================

Links to previous phases:
  ph1  → files table  (file_id FK for feedback)
  ph7  → file_scores  (9 signals + label — training features)
         phase7_model.joblib  (baseline model to beat)
  ph9  → reads phase7_model.joblib  (will work after promotion because
         ph11 saves a BARE model, same format ph7 uses)

What this phase does:
  1. record_feedback()   — called by Phase 12 UI when a human approves /
                           rejects / relabels a file.  Stored in `feedback`.
  2. run_phase11()       — joins feedback with file_scores signals, trains a
                           fresh RandomForest, compares it to the deployed
                           model on a held-out split using cost-weighted F1
                           (the "gate score"), and promotes only if it wins.
  3. rollback_to_version(n) — restores any previously saved version.

Promotion gate:
  Cost-weighted macro-F1 on a 20% held-out split.
  KEEP→DELETE errors cost the most (irreversible data loss).
  Candidate must beat baseline gate_score by MIN_IMPROVEMENT (default 0.01).

Model artifact format:
  Identical to ph7 — a bare joblib-serialised RandomForestClassifier.
  ph9 loads it with joblib.load() → predict_proba() without changes.

Install (all already in requirements.txt):
  pip install psycopg2-binary pandas numpy scikit-learn joblib python-dotenv
"""

import hashlib
import json
import logging
import os
import shutil
import time
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values, RealDictCursor
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
import joblib

load_dotenv()

# ── Config (mirrors ph7 so the retrained model is a drop-in replacement) ─────

DB_URL      = os.getenv("DATABASE_URL") or os.getenv("DB_URL")
MODEL_PATH  = os.getenv("PH7_MODEL_PATH", "phase7_model.joblib")
MODEL_DIR   = str(Path(MODEL_PATH).parent or ".")
MODEL_STEM  = Path(MODEL_PATH).stem          # "phase7_model"
REPORT_PATH = os.getenv("PH11_REPORT_PATH", "phase11_report.json")

MIN_FEEDBACK_TO_RETRAIN = int(os.getenv("PH11_MIN_FEEDBACK", 30))
MIN_IMPROVEMENT         = float(os.getenv("PH11_MIN_IMPROVEMENT", 0.01))
MIN_REVIEW_CONFIDENCE   = int(os.getenv("PH11_MIN_REVIEW_CONFIDENCE", 3))
MIN_CLASS_EXAMPLES      = int(os.getenv("PH11_MIN_CLASS_EXAMPLES", 5))
HOLDOUT_FRACTION        = float(os.getenv("PH11_HOLDOUT_FRACTION", 0.20))
MAX_TRAINING_ATTEMPTS   = int(os.getenv("PH11_MAX_TRAINING_ATTEMPTS", 3))

# ── Signal columns — must match ph7 exactly ───────────────────────────────────
SIGNAL_COLS = [
    "s_content_richness",
    "s_recency",
    "s_type_importance",
    "s_uniqueness",
    "s_extraction_quality",
    "s_content_depth",
    "s_cluster_density",
    "s_llm_quality",
    "s_semantic_proximity",
]

LABEL_TO_IDX = {"DELETE_CANDIDATE": 0, "REVIEW": 1, "ARCHIVE": 2, "KEEP": 3}
IDX_TO_LABEL = {v: k for k, v in LABEL_TO_IDX.items()}

# Misclassification costs [true_label][predicted_label] — used in gate_score().
# Higher = worse mistake.  KEEP→DELETE is the costliest (irreversible loss).
COSTS = {
    "DELETE_CANDIDATE": {"REVIEW": 0.5,  "ARCHIVE": 1.0, "KEEP": 2.0},
    "REVIEW":           {"DELETE_CANDIDATE": 1.5, "ARCHIVE": 0.5, "KEEP": 0.5},
    "ARCHIVE":          {"DELETE_CANDIDATE": 2.0, "REVIEW": 0.5, "KEEP": 1.0},
    "KEEP":             {"DELETE_CANDIDATE": 4.0, "REVIEW": 1.0, "ARCHIVE": 1.0},
}

# RF params — identical to ph7 so retrained model is a true drop-in
RF_PARAMS = {
    "n_estimators":     int(os.getenv("RF_N_ESTIMATORS", 300)),
    "max_depth":        int(os.getenv("RF_MAX_DEPTH", 15)) or None,
    "min_samples_leaf": int(os.getenv("RF_MIN_SAMPLES_LEAF", 2)),
    "class_weight":     None,   # we pass sample_weight explicitly
    "random_state":     42,
    "n_jobs":           -1,
}

VALID_LABELS    = set(LABEL_TO_IDX)
VALID_DECISIONS = {"APPROVE", "REJECT", "RELABEL"}

logging.basicConfig(
    filename="phase11_errors.log",
    level=logging.WARNING,
    format="%(asctime)s — %(levelname)s — %(message)s",
)

# ── DB ────────────────────────────────────────────────────────────────────────

def _conn():
    if not DB_URL:
        raise RuntimeError("DB_URL not set. Add it to your .env before running Phase 11.")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    return conn


def _create_tables(conn):
    with conn.cursor() as cur:
        # feedback — one row per human decision from the Phase 12 UI
        cur.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id                    SERIAL PRIMARY KEY,
                file_id               INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                predicted_label       TEXT,
                predicted_score       REAL,
                human_label           TEXT NOT NULL,
                correction_type       TEXT NOT NULL,   -- APPROVE | REJECT | RELABEL
                reviewer              TEXT,
                reviewer_confidence   INTEGER,          -- 1 unsure .. 5 certain
                reason_code           TEXT,
                note                  TEXT,
                model_version         TEXT,
                used_in_train         BOOLEAN DEFAULT FALSE,
                promoted_in_version   INTEGER DEFAULT NULL,
                training_attempts     INTEGER DEFAULT 0,
                created_at            TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_feedback_file ON feedback(file_id);
            CREATE INDEX IF NOT EXISTS idx_feedback_used  ON feedback(used_in_train);
        """)
        # Safely add columns for existing deployments
        for ddl in [
            "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS promoted_in_version INTEGER DEFAULT NULL",
            "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS training_attempts INTEGER DEFAULT 0",
        ]:
            cur.execute(ddl)

        # model_versions — audit log of every retrain attempt
        cur.execute("""
            CREATE TABLE IF NOT EXISTS model_versions (
                id                  SERIAL PRIMARY KEY,
                version             INTEGER UNIQUE,
                model_path          TEXT,
                promoted            BOOLEAN,
                gate_score          REAL,        -- cost-weighted macro-F1 (candidate)
                baseline_gate_score REAL,        -- cost-weighted macro-F1 (deployed)
                accuracy            REAL,
                feedback_count      INTEGER,
                checksum            TEXT,
                notes               TEXT,
                trained_at          TIMESTAMP DEFAULT NOW()
            );
        """)
    conn.commit()

# ── Public API: record human decisions (called by Phase 12 UI) ────────────────

def record_feedback(
    file_id: int,
    human_label: str,
    decision: str,
    predicted_label: str = None,
    predicted_score: float = None,
    reviewer: str = None,
    reviewer_confidence: int = 3,
    reason_code: str = None,
    note: str = None,
    model_version: str = None,
) -> dict:
    """
    Store one human decision.  Call this from the Phase 12 review UI.

      decision="APPROVE"  → reviewer agreed with AI label
      decision="REJECT"   → reviewer overrode; human_label is the correct one
      decision="RELABEL"  → reviewer manually set a different label

    reviewer_confidence: 1 (unsure) .. 5 (very certain)
    Rows below MIN_REVIEW_CONFIDENCE are stored but skipped during training.
    """
    human_label = (human_label or "").upper().strip()
    decision    = (decision    or "").upper().strip()

    if human_label not in VALID_LABELS:
        raise ValueError(f"human_label must be one of {sorted(VALID_LABELS)}, got {human_label!r}")
    if decision not in VALID_DECISIONS:
        raise ValueError(f"decision must be one of {sorted(VALID_DECISIONS)}, got {decision!r}")

    conn = _conn()
    try:
        _create_tables(conn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO feedback
                    (file_id, predicted_label, predicted_score, human_label,
                     correction_type, reviewer, reviewer_confidence,
                     reason_code, note, model_version)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (file_id, predicted_label, predicted_score, human_label,
                  decision, reviewer, reviewer_confidence,
                  reason_code, note, model_version))
            row = dict(cur.fetchone())
        conn.commit()
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def record_feedback_batch(items: list[dict]) -> int:
    """Bulk version — for batch-approve / batch-reject actions in Phase 12."""
    conn = _conn()
    try:
        _create_tables(conn)
        rows = []
        for item in items:
            hl = (item.get("human_label") or "").upper().strip()
            dc = (item.get("decision")    or "").upper().strip()
            if hl not in VALID_LABELS or dc not in VALID_DECISIONS:
                logging.warning(f"Skipping invalid feedback item: {item}")
                continue
            rows.append((
                item["file_id"],
                item.get("predicted_label"),
                item.get("predicted_score"),
                hl, dc,
                item.get("reviewer"),
                item.get("reviewer_confidence", 3),
                item.get("reason_code"),
                item.get("note"),
                item.get("model_version"),
            ))
        if rows:
            with conn.cursor() as cur:
                execute_values(cur, """
                    INSERT INTO feedback
                        (file_id, predicted_label, predicted_score, human_label,
                         correction_type, reviewer, reviewer_confidence,
                         reason_code, note, model_version)
                    VALUES %s
                """, rows)
        conn.commit()
        return len(rows)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# ── Gate metric: cost-weighted macro-F1 ──────────────────────────────────────

def gate_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Cost-weighted macro-F1.  Each class F1 is weighted by how bad it is
    to misclassify that class.  Result stays in [0, 1].
    Replaces plain accuracy as the promotion gate metric.
    """
    present = sorted(set(y_true) | set(y_pred))
    per_class_f1 = f1_score(y_true, y_pred, labels=present,
                             average=None, zero_division=0)
    weights = []
    for idx in present:
        name = IDX_TO_LABEL[idx]
        wrong = COSTS.get(name, {})
        weights.append(sum(wrong.values()) / len(wrong) if wrong else 1.0)
    weights = np.array(weights, dtype=float)
    weights /= weights.sum()
    return float(np.dot(per_class_f1, weights))

# ── Step 1: Load training data from ph7's file_scores ─────────────────────────

def _load_training_data(conn) -> pd.DataFrame:
    """
    Join feedback with file_scores (written by ph7).
    Uses the `files` table for the folder grouping key because file_scores
    does not store folder (only files and chunks tables do).
    Applies confidence filter and training-attempt cap.
    """
    print("  [1/5] Loading feedback + ph7 signals …")
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f"""
            SELECT
                fb.id                  AS feedback_id,
                fb.file_id,
                fb.human_label,
                fb.predicted_label,
                fb.correction_type,
                fb.reviewer_confidence,
                fb.training_attempts,
                fb.created_at,
                f.folder,              -- from files table (ph1)
                f.path,
                {', '.join(f'fs.{s}' for s in SIGNAL_COLS)}
            FROM feedback fb
            JOIN file_scores fs ON fb.file_id = fs.file_id   -- ph7
            JOIN files f        ON fb.file_id = f.id          -- ph1
            ORDER BY fb.created_at DESC
        """)
        rows = cur.fetchall()

    if not rows:
        print("      → 0 feedback rows found")
        return pd.DataFrame()

    df = pd.DataFrame(rows)

    # Keep only the most recent decision per file
    df = (df.sort_values("created_at")
            .drop_duplicates(subset="file_id", keep="last")
            .copy())

    # Confidence filter
    df["reviewer_confidence"] = df["reviewer_confidence"].fillna(3).astype(int)
    before = len(df)
    df = df[df["reviewer_confidence"] >= MIN_REVIEW_CONFIDENCE]
    if len(df) < before:
        print(f"      → Dropped {before - len(df):,} low-confidence rows")

    # Training-attempt cap
    df["training_attempts"] = df["training_attempts"].fillna(0).astype(int)
    over = df["training_attempts"] >= MAX_TRAINING_ATTEMPTS
    if over.any():
        print(f"      → Skipping {int(over.sum()):,} rows at attempt limit")
        df = df[~over]

    print(f"      → {len(df):,} usable labeled files")
    return df.reset_index(drop=True)


def _check_class_balance(df: pd.DataFrame):
    counts = df["human_label"].value_counts()
    bad = counts[counts < MIN_CLASS_EXAMPLES]
    if not bad.empty:
        raise ValueError(
            f"Too few examples per class (need >= {MIN_CLASS_EXAMPLES} each): "
            f"{bad.to_dict()}.  Collect more feedback before retraining."
        )

# ── Step 2: Train candidate on full labeled set, evaluate on holdout ──────────

def _train_and_evaluate(df: pd.DataFrame):
    """
    Split into train/holdout, fit a fresh RF (no warm_start), evaluate using
    gate_score (cost-weighted F1) on the holdout.
    Returns (model, gate_on_holdout, accuracy_on_holdout, eval_dict).
    """
    X = df[SIGNAL_COLS].fillna(0.0).values.astype(np.float32)
    y = df["human_label"].map(LABEL_TO_IDX).values

    # Balanced class weights
    classes = np.unique(y)
    cw = compute_class_weight("balanced", classes=classes, y=y)
    sw = np.array([dict(zip(classes, cw))[label] for label in y], dtype=np.float32)

    # Stratified holdout for gate comparison
    X_train, X_hold, y_train, y_hold, sw_train, _ = train_test_split(
        X, y, sw,
        test_size=HOLDOUT_FRACTION,
        stratify=y,
        random_state=42,
    )

    print("  [3/5] Training candidate RF …")
    model = RandomForestClassifier(**RF_PARAMS)
    model.fit(X_train, y_train, sample_weight=sw_train)

    y_pred_hold = model.predict(X_hold)
    gs   = gate_score(y_hold, y_pred_hold)
    acc  = float(accuracy_score(y_hold, y_pred_hold))

    # Classification report for the JSON report
    present      = sorted(set(y_hold) | set(y_pred_hold))
    target_names = [IDX_TO_LABEL[i] for i in present]
    report_dict  = classification_report(
        y_hold, y_pred_hold,
        labels=present, target_names=target_names,
        zero_division=0, output_dict=True,
    )

    print(f"      Holdout gate_score : {gs:.4f}")
    print(f"      Holdout accuracy   : {acc:.4f}")
    return model, gs, acc, report_dict


def _baseline_gate_score(conn) -> float:
    """Gate score of the last PROMOTED model (from model_versions)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT gate_score FROM model_versions
            WHERE promoted = TRUE
            ORDER BY trained_at DESC LIMIT 1
        """)
        row = cur.fetchone()
    return float(row[0]) if row and row[0] is not None else 0.0


def _deployed_model_gate_score(X_hold, y_hold) -> float:
    """
    Score the currently deployed ph7 model on the same holdout split.
    Returns 0.0 if no model exists yet (first run).
    """
    if not Path(MODEL_PATH).exists():
        return 0.0
    try:
        m = joblib.load(MODEL_PATH)
        # ph7 saves a bare model; ph11 promoted models are also bare
        if isinstance(m, dict):
            m = m.get("model", m)
        y_pred = m.predict(X_hold)
        return gate_score(y_hold, y_pred)
    except Exception as e:
        logging.warning(f"Could not score deployed model: {e}")
        return 0.0

# ── Step 3: Version, promote / reject ────────────────────────────────────────

def _next_version(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(version), 0) + 1 FROM model_versions")
        return int(cur.fetchone()[0])


def _checksum(path: str) -> str:
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()[:16]
    except Exception:
        return ""


def _save_versioned(model, version: int) -> str:
    """
    Save a BARE model (same format as ph7) so ph9 can load it unchanged.
    Also save a versioned copy for audit / rollback.
    """
    Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)
    versioned = str(Path(MODEL_DIR) / f"{MODEL_STEM}_v{version}.joblib")
    joblib.dump(model, versioned)   # bare model — ph9 compatible
    return versioned


def _log_version(conn, version, versioned_path, promoted,
                 gs_candidate, gs_baseline, acc, feedback_count, notes):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO model_versions
                (version, model_path, promoted, gate_score, baseline_gate_score,
                 accuracy, feedback_count, checksum, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (version) DO NOTHING
        """, (version, versioned_path, promoted,
              gs_candidate, gs_baseline, acc,
              feedback_count, _checksum(versioned_path), notes))


def _mark_used(conn, feedback_ids: list[int], version: int, promoted: bool):
    if not feedback_ids:
        return
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE feedback SET used_in_train = TRUE WHERE id = ANY(%s)",
            (feedback_ids,),
        )
        if promoted:
            cur.execute(
                "UPDATE feedback SET promoted_in_version = %s WHERE id = ANY(%s)",
                (version, feedback_ids),
            )
        else:
            cur.execute(
                "UPDATE feedback SET training_attempts = training_attempts + 1 "
                "WHERE id = ANY(%s)",
                (feedback_ids,),
            )

# ── Optional rollback ─────────────────────────────────────────────────────────

def rollback_to_version(version: int) -> dict:
    """Restore a previously promoted model version as the active model."""
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM model_versions WHERE version = %s AND promoted = TRUE",
                (version,),
            )
            row = cur.fetchone()
        if not row:
            raise ValueError(f"No promoted model found for version {version}.")
        src = row["model_path"]
        if not Path(src).exists():
            raise FileNotFoundError(f"Model file missing: {src}")
        shutil.copyfile(src, MODEL_PATH)
        conn.commit()
        print(f"  ✅ Rolled back to v{version}  ({MODEL_PATH})")
        return dict(row)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# ── Quick helper for Phase 12 ─────────────────────────────────────────────────

def should_retrain(min_feedback: int = None) -> dict:
    """Returns whether a retrain is warranted (no side-effects)."""
    threshold = min_feedback or MIN_FEEDBACK_TO_RETRAIN
    conn = _conn()
    try:
        _create_tables(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM feedback WHERE used_in_train = FALSE")
            new_fb = int(cur.fetchone()[0])
        df = _load_training_data(conn)
        conn.commit()
    finally:
        conn.close()
    return {
        "should_retrain":    new_fb >= threshold,
        "new_feedback_rows": new_fb,
        "threshold":         threshold,
        "usable_labeled":    len(df),
    }

# ── Entry point ───────────────────────────────────────────────────────────────

def run_phase11(min_feedback: int = None, force: bool = False) -> dict:
    t0 = time.time()
    threshold = min_feedback or MIN_FEEDBACK_TO_RETRAIN

    print("\n" + "=" * 62)
    print("  Phase 11 — Feedback and Continuous Learning")
    print("=" * 62)

    conn = _conn()
    try:
        _create_tables(conn)

        # ── Step 1: Load ──────────────────────────────────────────────────────
        df = _load_training_data(conn)

        if df.empty or len(df) < threshold:
            reason = (
                f"Need >= {threshold} usable feedback rows, have {len(df)}. "
                f"Production model left unchanged."
            )
            print(f"\n  ⚠  {reason}")
            conn.commit()
            report = {"phase": 11, "promoted": False,
                      "reason": reason, "elapsed_seconds": round(time.time()-t0,2)}
            with open(REPORT_PATH, "w") as f:
                json.dump(report, f, indent=2)
            return report

        # ── Step 2: Class balance check ────────────────────────────────────────
        try:
            _check_class_balance(df)
        except ValueError as e:
            reason = str(e)
            print(f"\n  ⚠  {reason}")
            conn.commit()
            report = {"phase": 11, "promoted": False, "reason": reason,
                      "elapsed_seconds": round(time.time()-t0,2)}
            with open(REPORT_PATH, "w") as f:
                json.dump(report, f, indent=2)
            return report

        # Disagreement analytics (informational)
        has_pred    = df["predicted_label"].notna()
        disagree_rt = None
        if has_pred.any():
            sub = df[has_pred]
            disagree_rt = round(float((sub["predicted_label"] != sub["human_label"]).mean()), 4)
            print(f"\n  [2/5] Disagreement rate: {disagree_rt:.1%}")

        # ── Step 3: Train + evaluate ───────────────────────────────────────────
        model, gs_cand, acc_cand, eval_report = _train_and_evaluate(df)

        # Score the DEPLOYED model on the same holdout for a fair comparison
        X_hold_data = df[SIGNAL_COLS].fillna(0.0).values.astype(np.float32)
        y_hold_data = df["human_label"].map(LABEL_TO_IDX).values
        from sklearn.model_selection import train_test_split as _tts
        _, X_hold, _, y_hold = _tts(
            X_hold_data, y_hold_data,
            test_size=HOLDOUT_FRACTION, stratify=y_hold_data, random_state=42,
        )
        gs_baseline = _deployed_model_gate_score(X_hold, y_hold)
        print(f"  [4/5] Gate scores — candidate: {gs_cand:.4f}  baseline: {gs_baseline:.4f}  "
              f"required gain: {MIN_IMPROVEMENT}")

        # ── Step 4: Promote or reject ──────────────────────────────────────────
        version   = _next_version(conn)
        versioned = _save_versioned(model, version)
        promoted  = force or (gs_cand >= gs_baseline + MIN_IMPROVEMENT) or gs_baseline == 0.0

        if promoted:
            shutil.copyfile(versioned, MODEL_PATH)   # update active model
            reason = (
                f"Candidate gate_score {gs_cand:.4f} beat baseline {gs_baseline:.4f} "
                f"by >= {MIN_IMPROVEMENT}."
            )
            print(f"  ✅ Promoted v{version} → {MODEL_PATH}")
        else:
            reason = (
                f"Rejected: candidate {gs_cand:.4f} did not beat baseline "
                f"{gs_baseline:.4f} by {MIN_IMPROVEMENT}."
            )
            print(f"  ❌ {reason}")

        _log_version(conn, version, versioned, promoted,
                     gs_cand, gs_baseline, acc_cand, len(df), reason)
        _mark_used(conn, df["feedback_id"].tolist(), version, promoted)

        conn.commit()

        # ── Step 5: Report ─────────────────────────────────────────────────────
        elapsed = round(time.time() - t0, 2)
        report  = {
            "phase":              11,
            "elapsed_seconds":    elapsed,
            "promoted":           promoted,
            "version":            version,
            "model_path":         MODEL_PATH,
            "reason":             reason,
            "feedback_rows_used": len(df),
            "candidate_gate_score":   round(gs_cand, 4),
            "baseline_gate_score":    round(gs_baseline, 4),
            "accuracy":               round(acc_cand, 4),
            "disagreement_rate":      disagree_rt,
            "label_breakdown":        df["human_label"].value_counts().to_dict(),
            "classification_report":  eval_report,
        }
        with open(REPORT_PATH, "w") as f:
            json.dump(report, f, indent=2, default=str)

        print(f"\n{'='*62}")
        print(f"  Feedback rows used   : {len(df):,}")
        print(f"  Candidate gate score : {gs_cand:.4f}")
        print(f"  Baseline gate score  : {gs_baseline:.4f}")
        print(f"  Accuracy (holdout)   : {acc_cand:.1%}")
        print(f"  Promoted             : {promoted}  (v{version})")
        print(f"  Elapsed              : {elapsed}s")
        print(f"  Report               : {REPORT_PATH}")
        print(f"{'='*62}")
        print("Phase 11 complete." + (
            "  Run Phase 7 / Phase 9 to use the improved model."
            if promoted else "  Production model unchanged."
        ))
        return report

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_phase11()