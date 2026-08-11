import { LISTING_URL, htmlFetch, parseListing, writeError, type JobResult } from "../helpers.js"

export interface SearchOpts {
  query?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const DEFAULT_PAGE_SIZE = 20

function renderTable(results: JobResult[]): string {
  if (results.length === 0) return "No results."
  const rows = results.map((r) => {
    const title = (r.title || "").slice(0, 42).padEnd(42)
    const loc = (r.location || "—").slice(0, 20).padEnd(20)
    const date = (r.date || "—").slice(0, 12)
    return `${r.id.padEnd(9)} ${title} ${loc} ${date}`
  })
  const header = "ID".padEnd(9) + " " + "TITLE".padEnd(42) + " " + "LOCATION".padEnd(20) + " DUE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(LISTING_URL)
    if (!html) {
      writeError(`Could not fetch ${LISTING_URL}`, "NOT_FOUND")
      return 1
    }

    const all = parseListing(html)
    const query = opts.query?.toLowerCase()
    const filtered = query ? all.filter((r) => `${r.title} ${r.location || ""}`.toLowerCase().includes(query)) : all

    const total = filtered.length
    const pageSize = opts.limit !== undefined ? opts.limit : DEFAULT_PAGE_SIZE
    const start = (opts.page - 1) * pageSize
    const results = filtered.slice(start, pageSize >= 0 ? start + pageSize : undefined)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        results.map((r) => `${r.title}\n  ${r.location || "—"} · due: ${r.date || "—"}\n  id: ${r.id}\n  ${r.url}`).join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: results.length, total, page: opts.page }, results }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
