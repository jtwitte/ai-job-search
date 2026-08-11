// Data source: SMHI's own Swedish-language listing page
// (smhi.se/jobba-pa-smhi/lediga-tjanster), which server-renders every open
// role directly into the HTML (Sitevision CMS - no JS execution needed).
// Each posting links out to SMHI's ReachMee ATS tenant for the full ad and
// application form. Deliberately Swedish-only: the Swedish listing carries
// more postings than any English equivalent (confirmed by the user), so this
// CLI never touches an English URL variant.

export const LISTING_URL = "https://www.smhi.se/jobba-pa-smhi/lediga-tjanster"

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch HTML with exponential backoff on 429/5xx. Returns null on a 404. */
export async function htmlFetch(url: string): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

export function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(html).replace(/\s+/g, " ").trim()
}

export interface JobResult {
  id: string
  title: string
  company: "SMHI"
  location: null
  date: string | null
  url: string
  summary: string | null
}

function idFromReachmeeUrl(url: string): string {
  const m = url.match(/rmjob=(\d+)/)
  return m ? m[1] : url
}

/**
 * Parse SMHI's own listing page: each open role is one <li class="sv-channel-item">
 * with a <time datetime="..."> (deadline), an <h2><a href="...&rmjob=<id>">title</a></h2>,
 * and a following <span class="normal"> summary. Split and parse each chunk
 * independently so one malformed item cannot break the rest.
 */
export function parseListing(html: string): JobResult[] {
  const chunks = html.split(/<li class="sv-channel-item"/).slice(1)
  const results: JobResult[] = []

  for (const chunk of chunks) {
    const linkMatch = chunk.match(/<a href="(https:\/\/web103\.reachmee\.com[^"]*rmjob=\d+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!linkMatch) continue
    const url = decodeHtmlEntities(linkMatch[1])
    const title = clean(linkMatch[2])
    if (!title) continue

    const dateMatch = chunk.match(/<time class="normal" datetime="([^"]*)"/)
    const summaryMatch = chunk.match(/<span class="normal">([\s\S]*?)<\/span>/)

    results.push({
      id: idFromReachmeeUrl(url),
      title,
      company: "SMHI",
      location: null,
      date: dateMatch ? dateMatch[1] : null,
      url,
      summary: summaryMatch ? stripTags(decodeHtmlEntities(summaryMatch[1])) || null : null,
    })
  }
  return results
}

export interface JobDetail {
  id: string
  title: string
  company: "SMHI"
  description: string | null
  url: string
}

/** Extract the job description from a ReachMee job page. */
export function parseDetail(html: string, id: string, url: string): JobDetail {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/)
  const title = titleMatch ? clean(titleMatch[1]).replace(/^SMHI\s*\|\s*/, "") : "(untitled)"

  const descMatch = html.match(/<div class="jobDescription"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)
  const description = descMatch ? stripTags(decodeHtmlEntities(descMatch[1])) || null : null

  return { id, title, company: "SMHI", description, url }
}
