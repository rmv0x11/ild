# ild

Anki-подобный веб-сервис для изучения китайского. Трёхшаговая карточка (иероглиф → пиньинь+TTS → перевод+контекст), SM-2 интервальное повторение, локальное хранилище в IndexedDB.

ТЗ — в [`task`](./task).

## Stack

React 19 · TypeScript · Vite · Tailwind v4 · Dexie · react-router · Vitest

## Quick start

Проект запускается только в Docker.

```bash
docker compose up --build dev    # http://localhost:5173 — Vite + HMR
docker compose up --build prod   # http://localhost:8080 — nginx со собранным бандлом
```

## Commands

| | |
|-|-|
| `docker compose up --build dev` | dev-сервер на 5173 с HMR |
| `docker compose down` | остановить dev |
| `docker compose up --build prod` | продакшн-сборка под nginx на 8080 |
| `npm run test:run` | Vitest (локально или внутри контейнера) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript без эмита |
| `npm run format` | Prettier |

Скрипты-обёртки: `npm run docker:dev`, `npm run docker:prod`, `npm run docker:prune`.

Локальный `npm run dev` использовать не нужно — окружение и зависимости унифицированы через Dockerfile.

Подробности по проекту — в [`CLAUDE.md`](./CLAUDE.md).
