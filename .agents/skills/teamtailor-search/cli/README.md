# teamtailor-cli

CLI for searching job listings on **any Teamtailor-powered career site**. Teamtailor is a
multi-tenant ATS used by many Swedish/European employers (e.g. IVL Svenska Miljöinstitutet,
RISE) — one CLI covers all of them via a `--site` domain, the same way `linkedin-search`
covers any country via `--location`.

**Data source**: each tenant's public `/jobs.rss` feed (search) and per-job pages carrying a
standard schema.org `JobPosting` JSON-LD block (detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Per-tenant AI-access check.** Every Teamtailor site can opt out of AI-agent access via
> `robots.txt`'s `Content-Signal: ai-input=no` — a directive distinct from classic crawler
> rules. Confirmed live during setup that this varies per company (IVL: yes, RISE: no on an
> otherwise near-identical robots.txt). This CLI checks it live for whichever `--site` you
> pass, before every `search`/`detail` call, and refuses to proceed if a site says no.

## Installation

```bash
cd .agents/skills/teamtailor-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search a Teamtailor site's open roles (`--site` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# All open roles at IVL (Swedish Environmental Research Institute)
bun run src/cli.ts search -s career.ivl.se --format table

# Keyword filter
bun run src/cli.ts search -s career.ivl.se -q "avloppsvatten" --format table

# Full detail for one job (bare id needs --site; a full URL doesn't)
bun run src/cli.ts detail 7988741 -s career.ivl.se --format plain
```

See `../SKILL.md` for the full flag reference and the ai-input note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--site` | `-s` | **Required.** Career site domain, e.g. `"career.ivl.se"`. |
| `--query` | `-q` | Keyword filter (title/department/location/description, client-side). |
| `--location` | `-l` | Filter by city/location text (client-side; feed has no location param). |
| `--jobage` | | Posted within N days (filtered client-side against `pubDate`). |
| `--locale` | | Feed locale, e.g. `"en-GB"`. Default: the site's bare feed. |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Results per page / cap. Default 20. |
| `--format` | | `json` \| `table` \| `plain`. |
