# File Cleanup Dashboard

This repository contains the backend and frontend for a file governance assistant.

## What to keep

- `backend/` — backend phase scripts and the chatbot API (`app.py` / `ph10.py`)
- `frontend/file-cleanup-dashboard/` — dashboard UI source and `package.json`
- `requirements.txt` — Python dependencies for the backend
- `.env` — backend environment configuration
- `frontend/file-cleanup-dashboard/.env` — frontend environment configuration
- `run_pipeline.py` — optional pipeline/startup helper
- `README.md` — this file

## What can be removed

These files and folders are typically generated outputs or local environment files and can be deleted if you only want the code and config:

- `chunk_index.json`
- `phase6_report.json`
- `phase7_model.joblib`
- `phase7_report.json`
- `phase9_report.json`
- `embedding_errors.log`
- `phase9_errors.log`
- `extraction_errors.log`
- `hash_errors.log`
- `tmp_ph9_validate.py`
- `__pycache__/`
- `.venv/`
- `review/`
- `root/`
- `llm_cache.json`
- `phase11_report.json`

If you keep the frontend source but want a clean workspace, you can also delete:

- `frontend/file-cleanup-dashboard/node_modules/`

## Setup

1. Install Python dependencies:

```powershell
cd c:\Users\jridi\OneDrive\Desktop\ai\v2\intern
python -m pip install -r requirements.txt
```

2. Create and configure the root `.env` file with your database and Groq keys.

3. Install frontend dependencies:

```powershell
cd frontend\file-cleanup-dashboard
npm install
```

## Run

### Start the backend

From the repo root:

```powershell
cd c:\Users\jridi\OneDrive\Desktop\ai\v2\intern
python app.py
```

This starts the FastAPI backend at:

- `http://127.0.0.1:8013`

### Start the frontend

In another terminal:

```powershell
cd c:\Users\jridi\OneDrive\Desktop\ai\v2\intern\frontend\file-cleanup-dashboard
npm run dev
```

The dashboard will be available at:

- `http://localhost:5173`

## Notes

- The backend reads configuration from `.env`.
- The frontend uses `frontend/file-cleanup-dashboard/.env` for any client config.
- You can also run `python run_pipeline.py` from the repo root if you want the helper script to start the application and optionally run the pipeline.
- `.venv` has been removed; recreate it if you want a local Python virtual environment.
