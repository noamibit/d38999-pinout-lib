# D38999 Pinout Lib

Android-first offline PWA для быстрого просмотра pin-arrangement diagrams D38999.

```
Letter → Number → Pinout (zoom · pan · mirror · wake lock · offline)
```

- Viewer: `app/` (React + TS + Vite, PWA, GitHub Pages)
- Library: `library/` (geometry JSON = source of truth, SVG генерируется)
- Tools: `tools/library` (render/validate/build), `tools/converter` (Python), `tools/qa`
- Docs: [requirements](docs/PRODUCT_REQUIREMENTS.md) · [architecture](docs/ARCHITECTURE.md) · [data model](docs/DATA_MODEL.md) · [converter](docs/CONVERTER_REQUIREMENTS.md) · [admin workflow](docs/ADMIN_WORKFLOW.md) · [milestones](docs/MILESTONES.md) · [decisions](docs/DECISIONS.md)

```bash
npm install
npm test
npm run dev        # viewer на synthetic fixtures
```
