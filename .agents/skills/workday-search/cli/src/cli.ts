#!/usr/bin/env bun
// Self-contained CLI for searching job listings on any Workday-powered
// career site (Workday is a multi-tenant enterprise ATS, e.g. Husqvarna
// Group). No external CLI framework, so it runs anywhere `bun` is available
// with zero install beyond the repo clone.
//
// Like teamtailor-search, checks each --site's robots.txt Content-Signal
// (ai-input) live before every request and refuses to proceed if a tenant
// has opted out.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", s: "site" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `workday-cli — search job listings on any Workday-powered career site

USAGE
  bun run src/cli.ts search --site <host/siteId> [flags]
  bun run src/cli.ts detail <reqId|url> [--site <host/siteId>] [--format json|plain]

SEARCH FLAGS
  --site, -s <text>       REQUIRED. e.g. "husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site"
                          (a locale segment like /en-US/ is fine too - only the last path segment is used).
  --query, -q <text>      Free-text keywords, matched server-side against title/location/req id.
  --location, -l <text>   Free-text location filter. Combined with --query into one search string
                          (Workday has no separate location parameter in this API - confirmed live).
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Results per page / cap. Default 20.
  --format <fmt>          json (default) | table | plain.

DETAIL FLAGS
  --site, -s <text>       Required if <reqId|url> is a bare requisition id (e.g. "R-17833"), not a full URL.
  --format <fmt>          json (default) | plain.

EXAMPLES
  bun run src/cli.ts search -s husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site -q "Robotics" --format table
  bun run src/cli.ts search -s husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site -l "Huskvarna" --format table
  bun run src/cli.ts detail R-17833 -s husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site --format plain
  bun run src/cli.ts detail https://husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site/job/Huskvarna/...-R-17833 --format plain

Checks each --site's robots.txt Content-Signal (ai-input=yes|no) live before every request —
refuses to proceed against a site that has opted out of AI-agent access.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const site = typeof flags.site === "string" ? flags.site : undefined
    if (!site) {
      process.stderr.write(
        JSON.stringify({ error: 'the --site/-s flag is required (e.g. -s "husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site")', code: "NO_SITE" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      site,
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const idOrUrl = (flags._ as string[])[1]
    if (!idOrUrl) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <reqId|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      idOrUrl,
      site: typeof flags.site === "string" ? flags.site : undefined,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
