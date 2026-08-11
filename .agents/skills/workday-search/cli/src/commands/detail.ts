import {
  apiBase,
  checkAiInput,
  normalizeSite,
  textFetch,
  toJobDetail,
  writeError,
  type RawJobDetailResponse,
  type RawSearchResponse,
  type Site,
} from "../helpers.js"

export interface DetailOpts {
  idOrUrl: string
  site?: string
  format: "json" | "plain"
}

/**
 * Resolve a requisition id (e.g. "R-17833") or a full job URL to a site +
 * externalPath. Workday's detail endpoint needs the full slugged path (a
 * bare req id 404s - confirmed live), and that path isn't derivable from the
 * id alone, so a bare id re-searches by searchText=<id> (confirmed live: an
 * exact req id in searchText returns exactly the one matching posting) to
 * find its real externalPath - self-healing, no guessing at slug format.
 *
 * A full URL (as returned by search's `url` or detail's `externalUrl`) is
 * shaped "https://<host>/<siteId>/job/<slug>" - the siteId segment right
 * after the host is enough to derive the site with no --site needed.
 */
async function resolve(
  idOrUrl: string,
  siteInput: string | undefined,
): Promise<{ site: Site; externalPath: string } | { notFound: true } | null> {
  if (/^https?:\/\//i.test(idOrUrl)) {
    const withoutScheme = idOrUrl.replace(/^https?:\/\//i, "")
    const [host, siteId, ...rest] = withoutScheme.split("/")
    if (!host || !siteId || rest[0] !== "job") return null
    const site: Site = { host, tenant: host.split(".")[0], siteId }
    const externalPath = "/" + rest.join("/")
    return { site, externalPath }
  }

  if (!siteInput) return null
  const site = normalizeSite(siteInput)
  if (!site) return null

  const body = JSON.stringify({ appliedFacets: {}, limit: 5, offset: 0, searchText: idOrUrl })
  const raw = await textFetch(`${apiBase(site)}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  })
  if (!raw) return null
  const data = JSON.parse(raw) as RawSearchResponse
  const match = (data.jobPostings ?? []).find((j) => j.bulletFields?.[0] === idOrUrl)
  if (!match) return { notFound: true }
  return { site, externalPath: match.externalPath }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const resolved = await resolve(opts.idOrUrl, opts.site)
  if (!resolved) {
    writeError(
      `Could not resolve "${opts.idOrUrl}" — pass a requisition id with --site <host/siteId>, or a full job URL with --site`,
      "BAD_ID",
    )
    return 1
  }
  if ("notFound" in resolved) {
    writeError(`No open posting with requisition id "${opts.idOrUrl}" on the current listing`, "NOT_FOUND")
    return 1
  }

  try {
    const url = `${apiBase(resolved.site)}${resolved.externalPath}`
    const raw = await textFetch(url, { headers: { Accept: "application/json" } })
    if (!raw) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const data = JSON.parse(raw) as RawJobDetailResponse
    const job = toJobDetail(data, `https://${resolved.site.host}${resolved.externalPath}`)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.datePosted ? `Posted: ${job.datePosted}` : "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
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
