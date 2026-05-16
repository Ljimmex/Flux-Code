# Flux Code

AI Code Assistant Desktop App — lokalne narzędzie do pracy z agentami AI kodującymi.

> "Twoje AI, twoje klucze, twój kod, twoja maszyna."

## Stack

| Warstwa | Technologia |
|---------|-------------|
| Desktop Shell | Electron |
| Frontend | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Database | SQLite (better-sqlite3) |
| State | Zustand |

## Wymagania

- Node.js 18+
- npm lub yarn

## Instalacja

```bash
npm install
```

## Development

```bash
# Terminal 1 — Vite dev server
npm run dev

# Terminal 2 — Electron
npm run electron
```

Lub jednocześnie:
```bash
npm run start:dev
```

## Build

```bash
npm run build
```

## Struktura

```
flux-code/
├── electron/          # Electron main + preload + db
│   ├── main.ts
│   ├── preload.ts
│   ├── db.ts
│   └── tsconfig.json
├── src/               # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   └── styles/
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Licencja

MIT
