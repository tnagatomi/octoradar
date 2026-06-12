# AGENTS.md

## Overview

Octoradar is a [Wails](https://wails.io) desktop app: a Go backend with a
React + TypeScript (Vite) frontend. It surfaces a GitHub activity feed and a
repository discover view, authenticated via GitHub OAuth device flow.

## Layout

- `main.go`, `app.go` — Wails entry point and the `App` struct bound to the frontend.
- `internal/` — backend packages: `config`, `discover`, `feed`, `github`, `oauth`.
- `frontend/src/` — React UI (`components/`, `hooks/`, `utils/`).
- Generated Go-to-JS bindings live in `frontend/wailsjs/` (do not edit by hand).

## Running

- `wails dev` — live development with frontend hot reload. A dev server with
  access to Go methods also runs at http://localhost:34115.
- `wails build` — produce a redistributable production package.

## Backend (Go)

- `go vet ./internal/...`
- `go test -race ./internal/...`
- `golangci-lint run ./internal/...`

The root package embeds `frontend/dist` and links Wails, so checks are scoped
to `internal/...` (matching CI). Build the frontend before the root package.

## Frontend (pnpm)

Run inside `frontend/`:

- `pnpm install` — install dependencies (uses the pinned `packageManager` version).
- `pnpm dev` — Vite dev server.
- `pnpm build` — `tsc` type check followed by `vite build`.
- `pnpm test` — run Vitest.

## Conventions

- Write all files, comments, and PR/issue text in English.
- Commit messages: Conventional Commits without scope (`<type>: <description>`).
- Respect the repository PR template and never expose private repo-specific
  information in source, issues, or PRs.
