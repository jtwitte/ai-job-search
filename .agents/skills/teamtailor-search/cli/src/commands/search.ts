import {
  checkAiInput,
  jobageToCutoff,
  normalizeSite,
  parseRssFeed,
  textFetch,
  writeError,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  site: string
  query?: string
  location?: string
  jobage?: number
  locale?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const DEFAULT_PAGE_SIZE = 20

function feedUrl(site: string, locale?: string): string {
  return locale ? `https://${site}/${locale}/jobs.rss` : `https://${site}/jobs.rss`
}

function renderTable(results: JobResult[]): string {
  if (results.length === 0) return "No results."
  const rows = results.map((r) => {
    const title = (r.title || "").slice(0, 42).padEnd(42)
    const company = (r.company || "—").slice(0, 24).padEnd(24)
    const loc = (r.location || "—").slice(0, 20).padEnd(20)
    const date = (r.date || "—").slice(0, 16)
    return `${r.id.padEnd(9)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(9) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const site = normalizeSite(opts.site)
  try {
    const aiInput = await checkAiInput(site)
    if (!aiInput.allowed) {
      writeError(
        `${site}'s robots.txt declares "${aiInput.raw}" — this site has opted out of AI-agent access ` +
          `(ai-input=no). Not proceeding. Check the site manually instead.`,
        "AI_INPUT_DISALLOWED",
      )
      return 1
    }

    const xml = await textFetch(feedUrl(site, opts.locale))
    if (!xml) {
      writeError(`No RSS feed found at ${feedUrl(site, opts.locale)} — is this a Teamtailor site?`, "NOT_FOUND")
      return 1
    }

    const parsed = parseRssFeed(xml)
    const query = opts.query?.toLowerCase()
    const location = opts.location?.toLowerCase()
    const cutoff = jobageToCutoff(opts.jobage)

    let filtered = parsed.filter(({ result, searchText }) => {
      if (query && !searchText.includes(query)) return false
      if (location && !(result.location || "").toLowerCase().includes(location)) return false
      if (cutoff && result.date && new Date(result.date) < cutoff) return false
      return true
    })

    const total = filtered.length
    const pageSize = opts.limit !== undefined ? opts.limit : DEFAULT_PAGE_SIZE
    const start = (opts.page - 1) * pageSize
    const results = filtered.slice(start, pageSize >= 0 ? start + pageSize : undefined).map((f) => f.result)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        results
          .map((r) => `${r.title}\n  ${r.company || "—"} · ${r.location || "—"} · ${r.date || "—"}\n  id: ${r.id}\n  ${r.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: results.length, total, page: opts.page, site }, results }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
