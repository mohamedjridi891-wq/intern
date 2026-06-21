# Tidy — File Cleanup Dashboard (Frontend)

A frontend-only implementation of the AI File Cleanup Dashboard described in the
brief: Overview, File Explorer, Search, Duplicates & Redundancy, Review Queue,
Assistant (chatbot), and Reports & Trends — all built around your existing
backend pipeline (`ph1.py` → `ph13.py`).

This is a live frontend dashboard that consumes your backend API.
Data comes from real endpoints like `GET /files`, `GET /review-queue`,
`GET /duplicates`, `POST /upload-folder`, and `POST /chat`.

## Run it locally

Requirements: Node.js 18+ and npm.

```bash
cd file-cleanup-dashboard
npm install
npm run dev
```

Then open the URL printed in the terminal (usually `http://localhost:5173`).

To build a production bundle:

```bash
npm run build
npm run preview   # serve the built files locally
```

## Project structure

```
src/
  lib/format.js          Small date/size formatting helpers
  components/            Shared UI: Sidebar, Topbar, StatusBadge, ScorePill,
                          WhyExplain (the "Why?" explainability popover),
                          FileDetailDrawer, ConfirmModal, MobileNav, Shared.jsx
  pages/
    Overview.jsx          KPIs, status breakdown, storage trend, attention panel
    FileExplorer.jsx       Folder tree + sortable/filterable table + bulk actions
    Search.jsx             Natural-language search with relevance cards
    Duplicates.jsx         Duplicate/near-duplicate cluster cards
    ReviewQueue.jsx        Swipe-style triage queue + decision history
    Assistant.jsx          Chat UI with inline charts/tables/file cards
    Reports.jsx            Trend charts + activity log + export buttons
```

## Connecting the real backend

This dashboard is wired to a live backend API. To connect your pipeline:

1. Stand up a small API (FastAPI works well — `ph13.py` / `ph10.py` already has the
  shape for this) exposing endpoints like:
   - `GET /files` → rows from the `files` + `file_scores` + `file_explanations` join
   - `GET /files/:id` → single file detail (signals, SHAP top/weak, explanation text)
   - `GET /duplicates` → `file_redundancy` / `duplicate_files`
   - `GET /review-queue` → files with `label IN ('REVIEW','DELETE_CANDIDATE')`
   - `POST /files/:id/action` → human decision (KEEP / ARCHIVE / DELETE / REVIEWED) —
     write-only from the UI's perspective; the backend should require human approval
     before ever touching a real file
   - `POST /chat` → proxies to `ph13.py`'s `/chat` endpoint
2. This dashboard already calls real backend endpoints like `GET /files`,
  `GET /review-queue`, `GET /duplicates`, `POST /upload-folder`, and `POST /chat`.
3. `WhyExplain.jsx` and `FileDetailDrawer.jsx` should load real explanation fields
  from your backend if you want more detailed file explanations.

## Notes on the design

- Blue is the primary brand color (`brand-600` / `#2563EB`), paired with a deep
  navy header/sidebar and pale blue backgrounds/hover states, per the brief.
- Status colors (green/amber/yellow/red) are used only for small badges and
  pills — never large fills — so blue stays the dominant visual language.
- Every score or AI recommendation has a "Why?" affordance that opens a
  plain-language explanation panel with signal-level detail — never raw
  model output.
- Every destructive or bulk action goes through a confirmation modal that
  states exactly what will happen and to how many files.
- Dark mode toggle in the top bar persists via the `dark` class on `<html>`.
