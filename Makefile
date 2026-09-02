COMPOSE_FILE := docker-compose.dev.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)
DETACH ?= 0
SHELL := /bin/bash

.PHONY: help up down restart clean install logs watch ps build test test-backend

help:
	@echo "make up       		- build (if needed) and start backend + frontend in the background"
	@echo "make down     		- stop and remove the containers, keep node_modules"
	@echo "make restart  		- down + up, keep node_modules"
	@echo "make clean-start    	- down + wipe app/backend/node_modules + app/frontend/node_modules + reinstall + up"
	@echo "make install  		- (re)install node_modules on the host via the container's npm"
	@echo "make logs     		- follow container logs"
	@echo "make ps       		- show container status"
	@echo "make build   		- rebuild the image without starting containers"
	@echo "make test    		- run the backend test suite inside the container"
	@echo ""
	@echo "make up/restart/clean-start automatically follow logs afterwards;"
	@echo "Ctrl+C or Ctrl+Z there gracefully runs 'make down'."
	@echo "Pass DETACH=1 to skip auto-logs, e.g. 'make up DETACH=1' (then use 'make logs' yourself)."

up:
	@[ -d app/backend/node_modules ] && [ -d app/frontend/node_modules ] || $(MAKE) install
	$(COMPOSE) up --build -d
	@if [ "$(DETACH)" = "1" ]; then \
		echo "Started in detached mode. Run 'make logs' to follow logs."; \
	else \
		$(MAKE) watch; \
	fi

down:
	$(COMPOSE) down

restart: down up

clean-start:
	$(COMPOSE) down
	rm -rf app/backend/node_modules app/frontend/node_modules
	$(MAKE) install
	$(COMPOSE) up --build -d
	@if [ "$(DETACH)" = "1" ]; then \
		echo "Started in detached mode. Run 'make logs' to follow logs."; \
	else \
		$(MAKE) watch; \
	fi

install:
	$(COMPOSE) build
	$(COMPOSE) run --rm app sh -c "npm --prefix app/backend install && npm --prefix app/frontend install"

logs:
	$(COMPOSE) logs -f

# Follows logs after up/restart/clean-start; Ctrl+C or Ctrl+Z tears the stack
# down gracefully instead of just detaching or suspending the log stream.
watch:
	@trap 'echo; echo "Shutting down..."; kill -CONT $$LOGS_PID 2>/dev/null; kill $$LOGS_PID 2>/dev/null; wait $$LOGS_PID 2>/dev/null; $(COMPOSE) down; exit 0' INT TSTP; \
	$(COMPOSE) logs -f & \
	LOGS_PID=$$!; \
	wait $$LOGS_PID

ps:
	$(COMPOSE) ps

build:
	$(COMPOSE) build

# Tests run inside the container on purpose. The Nest 12 packages are ESM-only while
# the backend compiles to CommonJS, so Jest has to require() ESM natively -- which
# needs Node >= 24.9 plus --experimental-vm-modules. The container is node:24-slim;
# a host on an older Node would fail with "Must use import to load ES Module".
test: test-backend

test-backend:
	$(COMPOSE) run --rm --no-deps app sh -c "npm --prefix app/backend test"
