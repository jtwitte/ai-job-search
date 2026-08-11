#!/usr/bin/env bun
// Self-contained CLI for searching job listings on any Teamtailor-powered
// career site (Teamtailor is a multi-tenant ATS used by many Swedish/European
// employers). No external CLI framework, so it runs anywhere `bun` is
// available with zero install beyond the repo clone.
//
// Every Teamtailor tenant can opt out of AI-agent access via robots.txt's
// `Content-Signal: ai-input=no` — this CLI checks that live per --site and
// refuses to proceed if a site has opted out. Confirmed live during setup
// that this varies per tenant (IVL: yes, RISE: no).

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

const HELP = `teamtailor-cli — search job listings on any Teamtailor-powered career site

USAGE
  bun run src/cli.ts search --site <domain> [flags]
  bun run src/cli.ts detail <id|url> [--site <domain>] [--format json|plain]

SEARCH FLAGS
  --site, -s <domain>     Career site domain. REQUIRED. e.g. "career.ivl.se", "career.ri.se".
  --query, -q <text>      Keyword filter, matched against title/department/location/description.
  --location, -l <text>   Filter by city/location text (client-side; Teamtailor has no location param).
  --jobage <days>         Posted within N days (filtered client-side against pubDate).
  --locale <code>         Feed locale, e.g. "en-GB". Default: the site's bare (usually local-language) feed.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Results per page / cap. Default 20.
  --format <fmt>          json (default) | table | plain.

Every open role for a site is in one RSS feed (no server-side search), so this CLI fetches the
whole feed and filters client-side — fine for the small job counts typical of a single employer.

DETAIL FLAGS
  --site, -s <domain>     Required if <id|url> is a bare numeric id, not a full URL.
  --format <fmt>          json (default) | plain.

EXAMPLES
  bun run src/cli.ts search -s career.ivl.se --format table
  bun run src/cli.ts search -s career.ivl.se -q "avloppsvatten" --format table
  bun run src/cli.ts search -s career.ri.se -q "forskningsingenjör" --jobage 30
  bun run src/cli.ts detail 7988741 -s career.ivl.se --format plain
  bun run src/cli.ts detail https://career.ivl.se/jobs/7988741-institutsdoktorand --format plain

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
      writeMissingSiteError()
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

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
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
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      locale: typeof flags.locale === "string" ? flags.locale : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const idOrUrl = (flags._ as string[])[1]
    if (!idOrUrl) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
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

function writeMissingSiteError(): void {
  process.stderr.write(
    JSON.stringify({
      error: 'the --site/-s flag is required (e.g. -s "career.ivl.se")',
      code: "NO_SITE",
    }) + "\n",
  )
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
