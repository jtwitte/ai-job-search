# workday-cli

CLI for searching job listings on **any Workday-powered career site**. Workday is a
multi-tenant enterprise ATS used by many large employers (e.g. Husqvarna Group) — one CLI
covers all of them via `--site`, the same pattern as `teamtailor-search`.

**Data source**: each tenant's public JSON API under `/wday/cxs/<tenant>/<siteId>/` — `POST
.../jobs` for search, `GET .../job/<path>` for detail.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Per-tenant AI-access check**, same as `teamtailor-search`: checks `robots.txt`'s
> `Content-Signal: ai-input` live for whichever `--site` you pass, before every call, and
> refuses to proceed if a tenant has opted out. Not observed on Husqvarna's own robots.txt,
> but checked defensively since it's a per-tenant setting on other platforms in this repo.

## Installation

```bash
cd .agents/skills/workday-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search a Workday site's open roles (`--site` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# All open roles at Husqvarna Group
bun run src/cli.ts search -s husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site --format table

# Keyword filter
bun run src/cli.ts search -s husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site -q "Robotics" --format table

# Full detail (requisition id needs --site; a full URL doesn't)
bun run src/cli.ts detail R-17833 -s husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site --format plain
```

See `../SKILL.md` for the full flag reference and notes on Workday's field quirks.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--site` | `-s` | **Required.** `host/siteId`, e.g. `"husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site"`. A locale segment (`/en-US/...`) is fine too. |
| `--query` | `-q` | Keyword filter, matched server-side against title/location/req id. |
| `--location` | `-l` | Free-text location filter — combined into the same search string as `--query` (Workday has no separate location param here). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Results per page / cap. Default 20. |
| `--format` | | `json` \| `table` \| `plain`. |
