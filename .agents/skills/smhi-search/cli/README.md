# smhi-cli

CLI for searching SMHI's own **Swedish-language** job listing page
(`smhi.se/jobba-pa-smhi/lediga-tjanster`). Deliberately Swedish-only per user instruction:
the Swedish listing carries more open postings than any English equivalent.

**Data source**: SMHI's Sitevision-rendered listing page (search) + linked ReachMee ATS job
pages (detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/smhi-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | List/filter SMHI's currently open roles |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# All open roles
bun run src/cli.ts search --format table

# Keyword filter
bun run src/cli.ts search -q "GIS" --format table

# Full detail (bare id re-resolves a live URL from the current listing)
bun run src/cli.ts detail 834 --format plain
```

See `../SKILL.md` for the full flag reference and a note on the `date` field's real meaning.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keyword filter over title + summary (client-side). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Results per page / cap. Default 20. |
| `--format` | | `json` \| `table` \| `plain`. |
