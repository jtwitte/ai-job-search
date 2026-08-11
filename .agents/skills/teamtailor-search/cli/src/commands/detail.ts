import { checkAiInput, normalizeSite, parseJobPostingLd, textFetch, writeError } from "../helpers.js"

export interface DetailOpts {
  idOrUrl: string
  site?: string
  format: "json" | "plain"
}

/**
 * Resolve the site and job URL from either a full Teamtailor job URL or a
 * bare numeric ID plus --site. A bare ID resolves fine without its slug or a
 * locale prefix (confirmed live: career.ivl.se/jobs/<id> redirects to the
 * full slugged URL), so detail never needs to know the exact slug.
 */
function resolve(idOrUrl: string, site?: string): { site: string; url: string } | null {
  if (/^https?:\/\//i.test(idOrUrl)) {
    const host = normalizeSite(idOrUrl)
    return { site: host, url: idOrUrl }
  }
  const idMatch = idOrUrl.match(/^\d+$/)
  if (idMatch && site) {
    const host = normalizeSite(site)
    return { site: host, url: `https://${host}/jobs/${idOrUrl}` }
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const resolved = resolve(opts.idOrUrl, opts.site)
  if (!resolved) {
    writeError(
      `Could not resolve "${opts.idOrUrl}" — pass a full job URL, or a numeric id with --site <domain>`,
      "BAD_ID",
    )
    return 1
  }

  try {
    const aiInput = await checkAiInput(resolved.site)
    if (!aiInput.allowed) {
      writeError(
        `${resolved.site}'s robots.txt declares "${aiInput.raw}" — this site has opted out of AI-agent access ` +
          `(ai-input=no). Not proceeding. Check the site manually instead.`,
        "AI_INPUT_DISALLOWED",
      )
      return 1
    }

    const html = await textFetch(resolved.url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobPostingLd(html, resolved.url)
    if (!job) {
      writeError("Could not find JobPosting data on that page", "NO_JOBPOSTING_DATA")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.datePosted ? `Posted: ${job.datePosted}` : "",
        job.validThrough ? `Deadline: ${job.validThrough}` : "",
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
