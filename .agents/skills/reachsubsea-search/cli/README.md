# reachsubsea-cli

CLI for searching Reach Subsea's own careers page (`reachsubsea.no/careers/`).

**Data source**: Reach Subsea's server-rendered listing page (search) + linked Talentech/
HR-Manager ad pages (detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/reachsubsea-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | List/filter Reach Subsea's currently open roles |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# All open roles
bun run src/cli.ts search --format table

# Keyword filter
bun run src/cli.ts search -q "Haugesund" --format table

# Full detail (bare ProjectId re-resolves DepartmentId/MediaId from the current listing)
bun run src/cli.ts detail 66974 --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keyword filter over title + workplace (client-side). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Results per page / cap. Default 20. |
| `--format` | | `json` \| `table` \| `plain`. |
