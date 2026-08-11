import { LISTING_URL, htmlFetch, parseDetail, parseListing, writeError } from "../helpers.js"

export interface DetailOpts {
  idOrUrl: string
  format: "json" | "plain"
}

/**
 * Resolve a bare ProjectId or a full ApplicationInit.aspx URL to a fetchable
 * detail URL. A full URL from search already carries DepartmentId/MediaId; a
 * bare ProjectId doesn't encode them, so it re-fetches the current listing
 * and reads the matching posting's live URL - self-healing, no guessing.
 */
async function resolveUrl(idOrUrl: string): Promise<{ id: string; url: string } | { notFound: true } | null> {
  if (/^https?:\/\//i.test(idOrUrl)) {
    const m = idOrUrl.match(/ProjectId=(\d+)/i)
    return { id: m ? m[1] : idOrUrl, url: idOrUrl }
  }
  if (!/^\d+$/.test(idOrUrl)) return null

  const html = await htmlFetch(LISTING_URL)
  if (!html) return null
  const match = parseListing(html).find((r) => r.id === idOrUrl)
  if (!match) return { notFound: true }
  return { id: match.id, url: match.url }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const resolved = await resolveUrl(opts.idOrUrl)
  if (!resolved) {
    writeError(`Could not resolve "${opts.idOrUrl}" — pass a ProjectId or a full ApplicationInit.aspx URL`, "BAD_ID")
    return 1
  }
  if ("notFound" in resolved) {
    writeError(`No open posting with ProjectId "${opts.idOrUrl}" on the current listing (it may have closed)`, "NOT_FOUND")
    return 1
  }

  try {
    const html = await htmlFetch(resolved.url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetail(html, resolved.id, resolved.url)

    if (opts.format === "plain") {
      const lines = [job.title, job.company, "", job.description || "(no description)", "", `URL: ${job.url}`]
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
