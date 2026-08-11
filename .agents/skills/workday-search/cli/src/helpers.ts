// Data source: Workday, a multi-tenant enterprise ATS used by many large
// employers (e.g. Husqvarna Group). Every tenant exposes the same public JSON
// API shape under /wday/cxs/<tenant>/<siteId>/ - search via POST .../jobs,
// detail via GET .../job/<externalPath> - so one CLI covers any Workday
// career site via --site, the same pattern as teamtailor-search.
//
// Like Teamtailor, a tenant's robots.txt can in principle carry a
// `Content-Signal: ai-input=no` opt-out (not observed on Husqvarna's own
// robots.txt, but checked live per --site anyway since it's a per-tenant
// setting elsewhere in this repo's other multi-tenant skills, and costs one
// extra request).

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export interface Site {
  host: string // e.g. "husqvarnagroup.wd3.myworkdayjobs.com"
  tenant: string // e.g. "husqvarnagroup" (host's first label, per Workday convention)
  siteId: string // e.g. "External_Career_Site"
}

/**
 * Accept "husqvarnagroup.wd3.myworkdayjobs.com/en-US/External_Career_Site",
 * a bare "host/siteId", a full https:// URL, or just "host" (siteId then
 * required to be supplied separately, which callers should reject).
 */
export function normalizeSite(input: string): Site | null {
  const stripped = input.trim().replace(/^https?:\/\//, "")
  const [host, ...pathParts] = stripped.split("/")
  const segments = pathParts.filter(Boolean)
  if (!host || segments.length === 0) return null
  const siteId = segments[segments.length - 1]
  const tenant = host.split(".")[0]
  if (!tenant || !siteId) return null
  return { host, tenant, siteId }
}

export function apiBase(site: Site): string {
  return `https://${site.host}/wday/cxs/${site.tenant}/${site.siteId}`
}

/**
 * Fetch text with exponential backoff on 429/5xx. Returns null on a 404.
 * Default Accept is the permissive wildcard, not "application/json" -
 * Workday's edge returns 406 for a JSON Accept header on a text/plain
 * resource like robots.txt (confirmed live via checkAiInput()). Callers that
 * need the CXS JSON API set `Accept: application/json` explicitly.
 */
export async function textFetch(url: string, init?: RequestInit): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, Accept: "*/*", ...(init?.headers || {}) },
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

export interface AiInputCheck {
  allowed: boolean
  declared: boolean
  raw: string | null
}

/** Same Content-Signal check used by teamtailor-search - see that skill's url-reference.md. */
export async function checkAiInput(host: string): Promise<AiInputCheck> {
  const text = await textFetch(`https://${host}/robots.txt`)
  if (!text) return { allowed: true, declared: false, raw: null }
  const m = text.match(/Content-Signal:\s*([^\n\r]*)/i)
  if (!m) return { allowed: true, declared: false, raw: null }
  const raw = m[1].trim()
  const aiInput = raw.match(/ai-input\s*=\s*(yes|no)/i)
  if (!aiInput) return { allowed: true, declared: false, raw }
  return { allowed: aiInput[1].toLowerCase() === "yes", declared: true, raw }
}

function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function decodeHtmlEntities(text: string): string {
  function numericEntity(cp: number): string {
    return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
  }
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

export interface RawJobPosting {
  title: string
  externalPath: string
  locationsText?: string
  postedOn?: string
  remoteType?: string
  bulletFields?: string[]
}

export interface RawSearchResponse {
  total: number
  jobPostings: RawJobPosting[]
}

export interface JobResult {
  id: string
  title: string
  company: null
  location: string | null
  date: string | null
  url: string
  remote: string | null
}

export function toJobResult(raw: RawJobPosting, site: Site): JobResult {
  return {
    id: raw.bulletFields?.[0] ?? raw.externalPath,
    title: raw.title,
    company: null, // not present on list items - see detail's hiringOrganization.name
    location: raw.locationsText ?? null,
    date: raw.postedOn ?? null, // relative text ("Posted Today") - see SKILL.md note
    // The list API's externalPath ("/job/...") is relative to the API base and
    // excludes siteId; the real public URL needs it (confirmed live: without
    // it, the page 404s) - shape must match detail's externalUrl exactly.
    url: `https://${site.host}/${site.siteId}${raw.externalPath}`,
    remote: raw.remoteType ?? null,
  }
}

export interface RawJobDetailResponse {
  jobPostingInfo: {
    title: string
    jobDescription: string
    location?: string
    postedOn?: string
    startDate?: string
    endDate?: string
    timeType?: string
    jobReqId?: string
    externalUrl?: string
  }
  hiringOrganization?: { name?: string }
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  datePosted: string | null
  deadline: string | null
  employmentType: string | null
  description: string | null
  url: string
}

export function toJobDetail(raw: RawJobDetailResponse, fallbackUrl: string): JobDetail {
  const info = raw.jobPostingInfo
  return {
    id: info.jobReqId ?? "",
    title: info.title,
    company: raw.hiringOrganization?.name ?? null,
    location: info.location ?? null,
    datePosted: info.startDate ?? null,
    deadline: info.endDate ?? null,
    employmentType: info.timeType ?? null,
    description: info.jobDescription ? stripTags(decodeHtmlEntities(info.jobDescription)) : null,
    url: info.externalUrl ?? fallbackUrl,
  }
}
