COMPOSE := docker compose
DETACH ?= 0
SHELL := /bin/bash

.PHONY: help up down restart reinstall logs watch ps build preview \
        migrate migrate-down migrate-status seed seed-down \
        test test-backend test-frontend sh-backend sh-frontend sh-db

help:
	@echo "make up            - build if needed and start postgres + backend + frontend"
	@echo "make down          - stop and remove the containers (the database volume survives)"
	@echo "make restart       - down + up"
	@echo "make reinstall     - rebuild the images and refresh node_modules -- use after any package.json change"
	@echo ""
	@echo "make migrate       - apply migrations (inside the backend container)"
	@echo "make migrate-down  - revert the last migration"
	@echo "make migrate-status- show which migrations have run"
	@echo "make seed          - load demo data (idempotent)"
	@echo "make seed-down     - remove demo data"
	@echo ""
	@echo "make test          - run both test suites in their containers"
	@echo "make test-backend / test-frontend - run just one"
	@echo "make logs / ps     - follow logs / show container status"
	@echo "make build         - rebuild the images without starting anything"
	@echo "make preview       - build the frontend and serve it on :4173 (the only way to exercise the service worker)"
	@echo "make sh-backend / sh-frontend / sh-db - open a shell in a container"
	@echo ""
	@echo "up/restart/reinstall follow logs afterwards; Ctrl+C or Ctrl+Z there runs 'make down'."
	@echo "Pass DETACH=1 to skip that, e.g. 'make up DETACH=1'."

up:
	$(COMPOSE) up --build -d
	@$(MAKE) --no-print-directory follow

down:
	$(COMPOSE) down

restart: down up

# node_modules lives in an anonymous volume, which compose fills from the image once and
# then keeps reusing -- so a rebuilt image alone does NOT update it. --renew-anon-volumes
# throws the old one away so the new image's modules are picked up. This is the target to
# run after editing either package.json.
reinstall:
	$(COMPOSE) up --build -d --renew-anon-volumes
	@$(MAKE) --no-print-directory follow

build:
	$(COMPOSE) build

# The service worker is disabled in the dev server on purpose, so offline cold-load can
# only be tested against a real build. Runs alongside the dev server, on its own port.
preview:
	$(COMPOSE) exec frontend sh -c 'npm run build && npm run preview'

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

# ------------------------------------------------------------------------------
# Database. Run inside the backend container on purpose: node_modules is no longer
# installed on the host, so sequelize-cli only exists in there. The container's DB_HOST
# is "postgres", so these reach the database over the compose network.
# ------------------------------------------------------------------------------
migrate:
	$(COMPOSE) exec backend npm run migrate:up

migrate-down:
	$(COMPOSE) exec backend npm run migrate:down

migrate-status:
	$(COMPOSE) exec backend npm run migrate:status

seed:
	$(COMPOSE) exec backend npm run seed:up

seed-down:
	$(COMPOSE) exec backend npm run seed:down:all

# ------------------------------------------------------------------------------
# Tests. --no-deps keeps postgres out of it: both suites are unit tests with the database
# mocked, so starting one would only slow them down.
# ------------------------------------------------------------------------------
test: test-backend test-frontend

test-backend:
	$(COMPOSE) run --rm --no-deps backend npm test

test-frontend:
	$(COMPOSE) run --rm --no-deps frontend npm test

sh-backend:
	$(COMPOSE) exec backend bash

sh-frontend:
	$(COMPOSE) exec frontend bash

# The credentials come from the container's own POSTGRES_* vars, so this stays correct
# even if .env changes them.
sh-db:
	$(COMPOSE) exec postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

# Follows logs after up/restart/reinstall; Ctrl+C or Ctrl+Z tears the stack down
# gracefully instead of just detaching or suspending the log stream.
follow:
	@if [ "$(DETACH)" = "1" ]; then \
		echo "Started in detached mode. Run 'make logs' to follow logs."; \
	else \
		$(MAKE) --no-print-directory watch; \
	fi

watch:
	@trap 'echo; echo "Shutting down..."; kill -CONT $$LOGS_PID 2>/dev/null; kill $$LOGS_PID 2>/dev/null; wait $$LOGS_PID 2>/dev/null; $(COMPOSE) down; exit 0' INT TSTP; \
	$(COMPOSE) logs -f & \
	LOGS_PID=$$!; \
	wait $$LOGS_PID
