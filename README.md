# FlashStack

Local-first spaced-repetition flashcard app, built with Astro + React. Create decks, add cards, and review them on an SM-2 schedule — everything stays in the browser's IndexedDB (Dexie). No login, no backend, no network calls.

> Status: the data layer (IndexedDB schema + SM-2 scheduling + reactive hooks) is complete; the page UI is still the Astro starter placeholder and is being built out.

## Features

- **Deck management** — create, list, and delete decks (deleting a deck cascades to its cards and review history).
- **Cards** — add/edit/delete question–answer cards inside a deck.
- **SM-2 spaced repetition** — each card tracks interval, repetitions, ease factor (starts at 2.5, floors at 1.3), due date, and last review; "due today" queries use a `[deckId+dueDate]` compound index.
- **Review log** — every review is recorded with its SM-2 quality rating (0–5) and before/after intervals.
- **Reactive UI hooks** — `useLiveQuery`-backed hooks re-render automatically on any write; no manual refetch, no global store.
- **Local-first storage** — Dexie (IndexedDB) under the `FlashStack` database name; all CRUD helpers fail loudly with a useful error if reached during SSR so islands must mount with `client:only="react"`.
- **PWA-ready config** — the original config shipped a `@vite-pwa/astro` setup (manifest + Workbox runtime caching + `/offline` fallback); it was removed from the config because the integration isn't in `package.json`. Re-add the dependency to restore it.

## Tech Stack

- [Astro](https://astro.build) 7 (static output, `output` default)
- [React](https://react.dev) 19 via `@astrojs/react`
- [Dexie](https://dexie.org) 4 + dexie-react-hooks (IndexedDB wrapper)
- TypeScript

## Quick Start

```sh
npm install
npm run dev      # dev server at http://localhost:4321
```

### Commands

| Command           | Action                                             |
| :---------------- | :------------------------------------------------- |
| `npm install`     | Installs dependencies                              |
| `npm run dev`     | Starts local dev server at `localhost:4321`        |
| `npm run build`   | Builds the production site to `./dist/`            |
| `npm run preview` | Preview the production build locally               |

## Project Structure

```text
/
├── public/                # Static assets (favicons)
├── src/
│   ├── lib/
│   │   ├── db.ts          # Dexie schema + deck/card/review CRUD + SM-2 scheduling
│   │   └── hooks.ts       # Reactive useLiveQuery hooks for React islands
│   └── pages/
│       └── index.astro    # Landing page (starter placeholder; UI in progress)
├── astro.config.mjs       # Static build config; base set for GitHub Pages
└── package.json
```

## Database Schema (Dexie)

| Table        | Indexes                                        |
| :----------- | :--------------------------------------------- |
| `decks`      | `++id, name, createdAt, updatedAt`             |
| `cards`      | `++id, deckId, dueDate, [deckId+dueDate]`      |
| `reviewLogs` | `++id, cardId, reviewedAt`                     |

New cards start with `interval: 0`, `repetitions: 0`, `easeFactor: 2.5`, and `dueDate: now` so they are immediately reviewable.

## Deploy

Static site — deployed to GitHub Pages. The built output from `npm run build` (`dist/`) is published to the repo root on the default branch, with Pages serving from that branch. Re-deploy with:

```sh
npm run build
# copy dist/* to repo root, commit, push
```

Built by Girish Lade — [ladestack.in](https://ladestack.in)
