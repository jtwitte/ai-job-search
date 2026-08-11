import {
  apiBase,
  checkAiInput,
  normalizeSite,
  textFetch,
  toJobResult,
  writeError,
  type JobResult,
  type RawSearchResponse,
} from "../helpers.js"

export interface SearchOpts {
  site: string
  query?: string
  location?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const DEFAULT_LIMIT = 20

function renderTable(results: JobResult[]): string {
  if (results.length === 0) return "No results."
  const rows = results.map((r) => {
    const title = (r.title || "").slice(0, 46).padEnd(46)
    const loc = (r.location || "—").slice(0, 22).padEnd(22)
    const date = (r.date || "—").slice(0, 16)
    return `${r.id.padEnd(12)} ${title} ${loc} ${date}`
  })
  const header = "ID".padEnd(12) + " " + "TITLE".padEnd(46) + " " + "LOCATION".padEnd(22) + " POSTED"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const site = normalizeSite(opts.site)
  if (!site) {
    writeError(
      `Could not parse --site "${opts.site}" — expected e.g. "husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site"`,
      "BAD_SITE",
    )
    return 1
  }

  try {
    const aiInput = await checkAiInput(site.host)
    if (!aiInput.allowed) {
      writeError(
        `${site.host}'s robots.txt declares "${aiInput.raw}" — this site has opted out of AI-agent access ` +
          `(ai-input=no). Not proceeding. Check the site manually instead.`,
        "AI_INPUT_DISALLOWED",
      )
      return 1
    }

    const limit = opts.limit !== undefined ? opts.limit : DEFAULT_LIMIT
    const offset = (opts.page - 1) * limit
    // Workday's search endpoint matches free text against title, location, and
    // job req id in one field — combine --query/--location into one string.
    const searchText = [opts.query, opts.location].filter(Boolean).join(" ")

    const body = JSON.stringify({ appliedFacets: {}, limit, offset, searchText })
    const raw = await textFetch(`${apiBase(site)}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    })
    if (!raw) {
      writeError(`No response from ${apiBase(site)}/jobs — is this a Workday site?`, "NOT_FOUND")
      return 1
    }
    const data = JSON.parse(raw) as RawSearchResponse
    const results = (data.jobPostings ?? []).map((j) => toJobResult(j, site))

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        results
          .map((r) => `${r.title}\n  ${r.location || "—"} · ${r.date || "—"}\n  id: ${r.id}\n  ${r.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: results.length, total: data.total ?? 0, page: opts.page, site: site.host }, results }, null, 2) +
          "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
