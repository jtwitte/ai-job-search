// Data source: Reach Subsea's own careers page (reachsubsea.no/careers/),
// which server-renders its open positions directly into the HTML (a
// WordPress block literally classed "rss-feed-careers", pulling from their
// Talentech/HR-Manager ATS backend) - no JS execution needed for search.
// Each posting links to a HR-Manager "ApplicationInit.aspx" page for the
// full ad text.

export const LISTING_URL = "https://reachsubsea.no/careers/"

// Reach Subsea's fixed HR-Manager customer id (confirmed live, stable across
// every posting observed - a permanent per-tenant identifier, not a rotating
// token, unlike SMHI's ReachMee "validator"). Safe to hardcode for a
// single-company skill.
const CID = "1021"

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
    .replace(/\r\n?/g, "\n") // normalize CRLF/CR before collapsing - Talentech's markup mixes literal \r\n with <p> tags
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

// Also strips residual tags (not just decodes entities) - confirmed live
// necessary: ProjectName divs carry a trailing <br> the naive version missed.
function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/**
 * Extract the inner HTML of a <div> identified by its id, correctly handling
 * nested <div> elements by tracking tag depth (same technique as
 * linkedin-search's extractDivContent - Talentech's ASP.NET markup nests
 * divs inside the description body).
 */
export function extractDivById(html: string, id: string): string | null {
  const openRe = new RegExp(`<div[^>]*\\bid="${id}"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(open.index + open[0].length, i - 6)
}

export interface JobResult {
  id: string
  title: string
  company: "Reach Subsea"
  location: string | null
  date: string | null
  url: string
}

interface ApplyParams {
  projectId: string
  departmentId: string | null
  mediaId: string | null
}

function parseApplyParams(url: string): ApplyParams | null {
  const m = url.match(/ProjectId=(\d+)/i)
  if (!m) return null
  const dept = url.match(/DepartmentId=(\d+)/i)
  const media = url.match(/MediaId=(\d+)/i)
  return { projectId: m[1], departmentId: dept ? dept[1] : null, mediaId: media ? media[1] : null }
}

export function detailUrl(p: ApplyParams): string {
  const params = new URLSearchParams({ cid: CID, ProjectId: p.projectId })
  if (p.departmentId) params.set("DepartmentId", p.departmentId)
  if (p.mediaId) params.set("MediaId", p.mediaId)
  return `https://candidate.hr-manager.net/ApplicationInit.aspx?${params.toString()}`
}

/**
 * Parse the careers page: each open role is one <a href="...ApplicationInit.aspx?...">
 * wrapping an <h2 class="h4"> title plus workplace/due-date divs. Split on
 * the repeating anchor and parse each chunk independently so one malformed
 * item cannot break the rest.
 */
export function parseListing(html: string): JobResult[] {
  const chunks = html.split(/<a href="(https:\/\/candidate\.hr-manager\.net\/ApplicationInit\.aspx\?[^"]*)"/).slice(1)
  const results: JobResult[] = []

  // .split() with a capturing group interleaves [url, restOfHtml, url, restOfHtml, ...]
  for (let i = 0; i < chunks.length; i += 2) {
    const rawUrl = chunks[i]
    const body = chunks[i + 1] ?? ""
    if (!rawUrl) continue
    const url = decodeHtmlEntities(rawUrl)
    const params = parseApplyParams(url)
    if (!params) continue

    const titleMatch = body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
    const title = titleMatch ? clean(titleMatch[1]) : ""
    if (!title) continue

    const workplaceMatch = body.match(/rss-feed-careers__workplace[\s\S]*?<p>([\s\S]*?)<\/p>/)
    const dueMatch = body.match(/rss-feed-careers__due[\s\S]*?<p>([\s\S]*?)<\/p>/)

    results.push({
      id: params.projectId,
      title,
      company: "Reach Subsea",
      location: workplaceMatch ? clean(workplaceMatch[1]) || null : null,
      date: dueMatch ? clean(dueMatch[1]) || null : null,
      url: detailUrl(params),
    })
  }
  return results
}

export interface JobDetail {
  id: string
  title: string
  company: "Reach Subsea"
  description: string | null
  url: string
}

/** Extract title + description from a HR-Manager ApplicationInit.aspx page. */
export function parseDetail(html: string, id: string, url: string): JobDetail {
  const titleMatch = html.match(/<div class="ProjectName">([\s\S]*?)<\/div>/)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  const descHtml = extractDivById(html, "AdvertisementInnerContent")
  const description = descHtml ? stripTags(decodeHtmlEntities(descHtml)) || null : null

  return { id, title, company: "Reach Subsea", description, url }
}
