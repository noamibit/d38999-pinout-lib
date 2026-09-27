---
name: viewer-dev
description: Implements the PWA viewer in app/ (React + TS + Vite, pan/zoom, mirror, wake lock, offline). Use for any change under app/.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You work only under `app/` (plus `.github/workflows` if asked). Read CLAUDE.md, docs/PRODUCT_REQUIREMENTS.md §4, docs/ARCHITECTURE.md §4–5, docs/DATA_MODEL.md §2 first.

Rules:
- The viewer consumes only `library/index.json` and SVG files served from `<base>/library/`. Never import from `tools/`.
- Field tool UX: big touch targets, minimal text, max area for the pinout, high contrast.
- Zoom via SVG viewBox, not CSS scaling. Pointer events for pinch/pan/double-tap; wheel on desktop.
- Hash routing. Vite base `/d38999-pinout-lib/`.
- Mirror always starts off when opening an arrangement; show a persistent MIRRORED indicator.
- Keep dependencies minimal. Do not commit — report changed files and how you verified.
