# ild

## Project

Anki-подобный веб-сервис для изучения китайского. Карточка показывается в три обязательных шага: иероглиф → пиньинь с автоматическим TTS → перевод с контекстом. Интервалы повторений — алгоритм SM-2 с 4 кнопками оценки (Again / Hard / Good / Easy). Всё хранится локально в IndexedDB, без бэкенда и регистрации. TTS — Web Speech API.

## Stack

- React 19.2 + React DOM 19.2
- TypeScript 5.9
- Vite 8.0 + @vitejs/plugin-react 6
- Tailwind v4.3 (через `@tailwindcss/vite`) + `tw-animate-css`
- Dexie 4.4 + dexie-react-hooks
- react-router-dom 7.15
- lucide-react 1.16, class-variance-authority, clsx, tailwind-merge
- papaparse 5.5
- Vitest 4.1 + @vitest/ui + jsdom + fake-indexeddb + @testing-library/{react,jest-dom,user-event}
- ESLint 10.4 (flat config) + typescript-eslint 8 + eslint-config-prettier
- Prettier 3.8 + prettier-plugin-tailwindcss

## Commands

**Запуск приложения — только в Docker.** Не используй `npm run dev`/`npm run preview`/`npm run build` локально для запуска приложения.

| | |
|-|-|
| `docker compose up --build dev` | dev-сервер на 5173 |
| `docker compose up --build prod` | nginx-prod на 8080 |
| `docker compose down` | стоп |

- `docker compose up --build dev` — Vite dev-сервер (заменяет локальный `npm run dev`)
- `npm run build` — `tsc -b && vite build` (используется внутри Docker-сборки)
- `npm run preview` — предпросмотр сборки (использовать только внутри контейнера при необходимости)
- `npm run test` — Vitest watch
- `npm run test:run` — Vitest однократно
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` — Prettier
- `npm run typecheck` — `tsc -b --noEmit`

## Structure

- `src/app/` — корневые app-компоненты (router, layout, providers)
- `src/components/ui/` — shadcn-style примитивы (Button, Card, …)
- `src/features/review/` — экран повторения карточек (3-шаговый flow, кнопки оценки)
- `src/features/deck/` — управление колодами, импорт CSV
- `src/features/stats/` — статистика (due / young / mature)
- `src/lib/sm2/` — чистое SM-2 ядро (без I/O, без Date.now внутри функций)
- `src/lib/csv/` — обёртки над papaparse (parse/serialize)
- `src/lib/storage/` — Dexie + репозитории
- `src/lib/tts/` — Web Speech API wrapper
- `src/types/` — доменные типы (`Card`, `Review`, `Deck`, …)
- `src/test/` — setup-файлы для Vitest

## Conventions

- TS strict, `verbatimModuleSyntax: true` → всегда `import type { … }` для типов.
- Алиас `@/` → `src/`.
- Чистые функции в `lib/sm2`: не мутируют `Card`, возвращают новый объект.
- Vitest: `globals: true`, окружение `jsdom`, `fake-indexeddb/auto` в setup.
- Dexie — singleton, экспортируется как `db` из `@/lib/storage/db`.
- UI: shadcn-style + `cn()` из `@/lib/utils`. Tailwind v4, CSS-переменные в `src/index.css`.
- Никакого CSS-in-JS, никакого Redux. Локальный state + Dexie (+ dexie-react-hooks).

## SM-2 нюансы (выдержка из ТЗ)

- Learning steps: 1м → 5м → 20м.
- Relearning steps: 10м → 1м → 5м → 20м.
- Mature threshold: 21 день.
- `Again` на mature → карточка полностью сбрасывается, история интервалов стирается.
- Initial ease 2.5, min ease 1.3.
- `Easy` на learning → сразу переходит в young, минуя оставшиеся шаги.

## Стиль работы

**По умолчанию — fanout subagents.** Для любой задачи, которую можно разбить на независимые блоки (несколько файлов, не пересекающиеся скоупы, параллельные ветви), сразу спавнить параллельных subagents через Agent tool (`run_in_background: true`), а не выполнять последовательно в основном цикле. Подходит:
- Внедрение фич, состоящих из нескольких слоёв (UI + storage + tests).
- Покрытие тестами нескольких папок.
- Документация + код + конфиг.
- Багфиксы в разных независимых местах.

Маленькие точечные правки (1-2 файла, тесные зависимости) — можно делать самому без fanout. При сомнении — спавни.

## Что НЕ делать

- Не добавлять бэкенд, SSR, tRPC.
- Не вводить Redux / Zustand / Jotai — локальный state + Dexie достаточно.
- Не использовать CSS-in-JS (styled-components, emotion).
- Не ставить Husky / lint-staged.
- Никаких новых тяжёлых зависимостей без обсуждения.
