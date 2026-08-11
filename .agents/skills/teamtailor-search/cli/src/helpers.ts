// Data source: Teamtailor, a multi-tenant ATS used by many Swedish/European
// employers (RISE, IVL, and others). Every tenant exposes a public RSS job
// feed at /jobs.rss (optionally locale-prefixed, e.g. /en-GB/jobs.rss) plus
// per-job pages carrying a standard schema.org JobPosting JSON-LD block — no
// company-specific scraping needed, just a --site domain.
//
// Each tenant configures its own robots.txt, including a Teamtailor-specific
// `Content-Signal: ai-input=yes|no` directive that is distinct from the
// classic Disallow rules and specifically about AI/agent use of the content
// (confirmed live: IVL declares ai-input=yes, RISE declares ai-input=no, on
// otherwise near-identical robots.txt files). This CLI checks that signal live
// for whichever --site you pass and refuses to proceed if it says no — this is
// a per-tenant setting, not something baked in once at build time.

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Accept "career.ivl.se", "https://career.ivl.se", "https://career.ivl.se/en-GB", etc. */
export function normalizeSite(input: string): string {
  return input.trim().replace(/^https?:\/\//, "").split("/")[0]
}

/** Fetch text with exponential backoff on 429/5xx. Returns null on a 404. */
export async function textFetch(url: string): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
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

export interface AiInputCheck {
  allowed: boolean
  declared: boolean
  raw: string | null
}

/**
 * Fetch and interpret robots.txt's `Content-Signal: ai-input=yes|no` for a
 * site. Undeclared (no Content-Signal line, or no robots.txt at all) defaults
 * to allowed, matching how an absent classic Disallow is treated — silence is
 * not an opt-out.
 */
export async function checkAiInput(site: string): Promise<AiInputCheck> {
  const text = await textFetch(`https://${site}/robots.txt`)
  if (!text) return { allowed: true, declared: false, raw: null }
  const m = text.match(/Content-Signal:\s*([^\n\r]*)/i)
  if (!m) return { allowed: true, declared: false, raw: null }
  const raw = m[1].trim()
  const aiInput = raw.match(/ai-input\s*=\s*(yes|no)/i)
  if (!aiInput) return { allowed: true, declared: false, raw }
  return { allowed: aiInput[1].toLowerCase() === "yes", declared: true, raw }
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
  company: string | null
  location: string | null
  date: string | null
  url: string
  department: string | null
  remote: string | null
}

function idFromUrl(url: string): string {
  const m = url.match(/\/jobs\/(\d+)/)
  return m ? m[1] : url
}

/**
 * Parse a Teamtailor RSS feed. One <item> per open role; split and parse each
 * chunk independently so one malformed item cannot break the rest. Returns
 * each result paired with its plain-text description (title + department +
 * stripped body), used for client-side --query/--location matching without
 * carrying the full description into the output shape.
 */
export function parseRssFeed(xml: string): Array<{ result: JobResult; searchText: string }> {
  const channelTitle = xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1]
  const company = channelTitle ? clean(channelTitle) || null : null

  const chunks = xml.split(/<item>/).slice(1).map((c) => c.split(/<\/item>/)[0])
  const out: Array<{ result: JobResult; searchText: string }> = []

  for (const chunk of chunks) {
    const title = chunk.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    const link = chunk.match(/<link>([\s\S]*?)<\/link>/)?.[1]
    if (!title || !link) continue

    const pubDate = chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? null
    const remote = chunk.match(/<remoteStatus>([\s\S]*?)<\/remoteStatus>/)?.[1]?.trim() ?? null
    const department = chunk.match(/<tt:department>([\s\S]*?)<\/tt:department>/)?.[1]
    const locName = chunk.match(/<tt:name>([\s\S]*?)<\/tt:name>/)?.[1]
    const locCity = chunk.match(/<tt:city>([\s\S]*?)<\/tt:city>/)?.[1]
    const location = clean(locName || locCity || "") || null
    const descRaw = chunk.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? ""
    const descText = stripTags(decodeHtmlEntities(descRaw))

    const result: JobResult = {
      id: idFromUrl(link),
      title: clean(title),
      company,
      location,
      date: pubDate,
      url: link.trim(),
      department: department ? clean(department) : null,
      remote,
    }
    const searchText = [result.title, result.department, result.location, descText]
      .filter(Boolean)
      .join(" \n ")
      .toLowerCase()
    out.push({ result, searchText })
  }
  return out
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  datePosted: string | null
  validThrough: string | null
  employmentType: string | null
  description: string | null
  url: string
}

/** Extract and parse the schema.org JobPosting JSON-LD block from a job page. */
export function parseJobPostingLd(html: string, url: string): JobDetail | null {
  const blocks = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) ?? []
  for (const block of blocks) {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "")
    let data: any
    try {
      data = JSON.parse(inner)
    } catch {
      continue
    }
    if (data?.["@type"] !== "JobPosting") continue

    const addr = data.jobLocation?.[0]?.address
    const location = addr
      ? [addr.addressLocality, addr.addressRegion || addr.addressCountry].filter(Boolean).join(", ") || null
      : null

    return {
      id: idFromUrl(url) || String(data.identifier?.value ?? ""),
      title: data.title ?? "(untitled)",
      company: data.hiringOrganization?.name?.trim() || null,
      location,
      datePosted: data.datePosted ?? null,
      validThrough: data.validThrough ?? null,
      employmentType: data.employmentType ?? null,
      description: data.description ? stripTags(decodeHtmlEntities(data.description)) : null,
      url,
    }
  }
  return null
}

/** Convert a job-age in days to a cutoff Date for filtering by pubDate. */
export function jobageToCutoff(days: number | undefined): Date | null {
  if (!days || days <= 0 || days >= 9999) return null
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}
