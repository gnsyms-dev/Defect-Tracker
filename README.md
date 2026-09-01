# Hakka

Monorepo with two independently deployable apps:

- `app/backend` — NestJS API
- `app/frontend` — React + TypeScript (Vite)

In development, both apps run together inside a single Docker container (hot-reload on both sides), talking to a Postgres instance running on your host machine. See `.claude/skills/project-structure/SKILL.md` for the full layout and deployment model.

## Prerequisites

- Docker + Docker Compose
- `make`
- A Postgres server running locally on your host, reachable on `5432`

## Setup

1. Copy the backend env file and fill in your local DB credentials:

   ```bash
   cp app/backend/.env.example app/backend/.env
   ```

   Edit `app/backend/.env` and set `DB_USERNAME` / `DB_PASSWORD` to match your local Postgres. Everything else has a sane default. The container reaches your host's Postgres automatically via `host.docker.internal` — no need to change `DB_HOST`.

2. Start everything:

   ```bash
   make up
   ```

   First run installs `node_modules` for both apps (via the container's own `npm install`, so native dependencies match the container's environment) before starting. This can take a minute; subsequent runs are fast.

## URLs

- Backend: http://localhost:5000/api/v1
- Frontend: http://localhost:5173

## Commands

| Command | What it does |
|---|---|
| `make up` | Build (if needed) and start backend + frontend in the background |
| `make down` | Stop and remove the containers, keep `node_modules` |
| `make restart` | `down` + `up`, keep `node_modules` |
| `make clean-start` | `down` + wipe `app/backend/node_modules` and `app/frontend/node_modules` + reinstall + `up` — use this after a `package.json` change or if dependencies get into a weird state |
| `make install` | (Re)install `node_modules` on the host via the container's own `npm` |
| `make logs` | Follow container logs |
| `make ps` | Show container status |
| `make build` | Rebuild the image without starting containers |

## Notes

- `app/backend/node_modules` and `app/frontend/node_modules` are the same directories the container reads/writes — they're visible from your host/IDE, not hidden inside Docker.
- Source changes in `app/backend/src` and `app/frontend/src` hot-reload automatically; no restart needed for day-to-day edits.
- Run `make logs` in a separate terminal to watch both apps' output together.
