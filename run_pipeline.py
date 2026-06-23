"""
run_pipeline.py — Run indexing phases (1-9) to scan root folder and populate DB
"""
import os
import sys
import subprocess
import logging
import shutil

from dotenv import load_dotenv

load_dotenv()
os.environ["PYTHONUTF8"] = "1"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] [%(levelname)s] %(message)s"
)
log = logging.getLogger("pipeline")

def run_phases():
    root_folder = None
    if len(sys.argv) > 1:
        root_folder = sys.argv[1]

    try:
        result = run_pipeline(root_folder)
        log.info("Starting backend and frontend now...")
        log.info("")
        start_backend_and_frontend(os.path.dirname(__file__))
        return result
    except Exception as e:
        log.error(f"Pipeline failed: {e}", exc_info=True)
        sys.exit(1)


def run_pipeline(root_folder: str | None = None) -> dict:
    """Run phases 1-7 to index and score files.

    If root_folder is provided, Phase 1 will be invoked with that folder path.
    Otherwise Phase 1 runs with its configured default.
    """
    db_url = os.getenv("DATABASE_URL") or os.getenv("DB_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL (or DB_URL) not set in .env")

    log.info("")
    log.info("=" * 70)
    log.info("Running Pipeline: Index and Score Root Folder")
    log.info("=" * 70)
    log.info("")

    backend_dir = os.path.dirname(__file__)
    phases = [
        ('ph1.py', 'Indexing files from root folder'),
        ('ph2.py', 'Extracting content from files'),
        ('ph3.py', 'Chunking content'),
        ('ph4.py', 'Building Qdrant embeddings index'),
        ('ph6.py', 'Detecting duplicates'),
        ('ph7.py', 'Scoring files'),
        ('ph9.py', 'Generating explainability and file explanations'),
    ]

    for i, (phase_file, desc) in enumerate(phases, 1):
        log.info(f"[Phase {i}] {desc}...")
        phase_path = os.path.join(backend_dir, phase_file)
        cmd = [sys.executable, "-X", "utf8", phase_path]
        if i == 1 and root_folder:
            cmd.append(str(root_folder))
        result = subprocess.run(
            cmd,
            cwd=backend_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            log.error(f"Phase {i} failed: {result.stderr}")
            raise RuntimeError(f"Phase {i} ({phase_file}) exited with code {result.returncode}: {result.stderr}")
        log.info(f"✓ Phase {i} complete\n")

    log.info("=" * 70)
    log.info("✓ Pipeline complete! Files indexed and scored.")
    log.info("")
    return {
        "status": "ok",
        "root_folder": str(root_folder) if root_folder is not None else None,
        "message": "All pipeline phases completed successfully",
    }


def start_backend_and_frontend(backend_dir):
    app_path = os.path.join(backend_dir, 'app.py')
    frontend_dir = os.path.join(os.path.dirname(__file__), 'frontend', 'file-cleanup-dashboard')

    if not os.path.exists(app_path):
        log.error(f"Backend entrypoint not found: {app_path}")
        sys.exit(1)
    if not os.path.exists(frontend_dir):
        log.error(f"Frontend folder not found: {frontend_dir}")
        sys.exit(1)

    log.info("Launching backend from:")
    log.info(f"  {app_path}")
    log.info("Launching frontend from:")
    log.info(f"  {frontend_dir}")
    log.info("")

    # Start frontend in background if npm exists.
    npm_exec = shutil.which('npm')
    if npm_exec is None:
        log.warning('npm not found on PATH; frontend will not start automatically.')
    else:
        try:
            subprocess.Popen([npm_exec, 'run', 'dev'], cwd=frontend_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.info('Frontend started in background.')
        except Exception as e:
            log.warning(f'Could not start frontend automatically: {e}')

    os.execv(sys.executable, [sys.executable, "-X", "utf8", app_path])


if __name__ == "__main__":
    run_phases()
