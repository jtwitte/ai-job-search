# Teamtailor URL Reference

Public, unauthenticated endpoints exposed by any Teamtailor-powered career site. Teamtailor
is a multi-tenant ATS — the same two endpoint shapes work for every customer, only the
domain (`--site`) changes. Investigated 2026-08-11 against `career.ivl.se` (IVL Svenska
Miljöinstitutet) and spot-checked against `career.ri.se` (RISE).

## Search: RSS feed

```
GET https://<site>/jobs.rss
GET https://<site>/<locale>/jobs.rss   (e.g. /en-GB/jobs.rss)
```

Both forms return `200` with the same set of jobs; only the feed's `<channel><description>`
and (presumably) the job description language differ by locale. No locale segment is
required — the bare form serves the tenant's default-locale feed.

Returns every currently open role in one response (no server-side search, filter, or
pagination params found or expected — Teamtailor's public feed is a flat "everything open
right now" list). This CLI fetches the whole feed and filters `--query`/`--location`/
`--jobage` client-side, which is fine for the small per-employer job counts typical of a
single company (IVL: 3 open roles; RISE: 23, at time of testing).

### Item shape

```xml
<item>
  <title>Institutsdoktorand inom kvartär rening av avloppsvatten</title>
  <description>&lt;p&gt;...HTML...&lt;/p&gt;</description>
  <pubDate>Mon, 29 Jun 2026 17:59:33 +0200</pubDate>
  <link>https://career.ivl.se/en-GB/jobs/7988741-institutsdoktorand-...</link>
  <remoteStatus>hybrid</remoteStatus>
  <guid>7df28564-8af0-4576-9655-8d8ad4988029</guid>
  <tt:locations>
    <tt:location>
      <tt:name>Stockholm, Sverige</tt:name>
      <tt:address>Valhallavägen 81</tt:address>
      <tt:zip>114 28</tt:zip>
      <tt:city>Stockholm</tt:city>
      <tt:country>Sweden</tt:country>
    </tt:location>
  </tt:locations>
  <tt:department>Miljöteknik, vatten och avlopp</tt:department>
  <tt:role/>
</item>
```

The numeric job ID is the leading digits in `<link>`'s path (`/jobs/<id>-<slug>`) — the CLI
extracts it with `idFromUrl()` in `helpers.ts`. The channel's own `<title>` is the company
name (constant across all items in one feed).

## Detail: schema.org JobPosting JSON-LD

```
GET https://<site>/jobs/<id>              (slug optional — redirects to the full URL)
GET https://<site>/<locale>/jobs/<id>-<slug>
```

Confirmed live: a bare `/jobs/<id>` with no slug and no locale prefix resolves fine (200,
served at the canonical slugged URL) — the CLI never needs to know a job's slug, only its
numeric ID and the site domain.

Every job page embeds one `<script type="application/ld+json">` block of type `JobPosting`:

```jsonc
{
  "@context": "http://schema.org/",
  "@type": "JobPosting",
  "title": "Institutsdoktorand inom kvartär rening av avloppsvatten",
  "description": "<p>...HTML, HTML-entity-escaped...</p>",
  "identifier": { "@type": "PropertyValue", "name": "IVL Svenska Miljöinstitutet ", "value": "7988741" },
  "datePosted": "2026-08-03T00:00:00+02:00",
  "employmentType": "FULL_TIME",
  "hiringOrganization": { "@type": "Organization", "name": "IVL Svenska Miljöinstitutet ", "logo": "...", "sameAs": "https://career.ivl.se" },
  "validThrough": "2026-08-16 23:59:59 +0200",
  "jobLocation": [{ "@type": "Place", "address": { "@type": "PostalAddress", "streetAddress": "...", "addressLocality": "Stockholm", "postalCode": "114 28", "addressCountry": "SE", "addressRegion": "Sverige" } }]
}
```

Parses directly with `JSON.parse` on the raw script-tag content — no pre-unescaping needed
(the block is valid JSON as-is; only the `description` *value* is itself HTML that needs
`stripTags`/`decodeHtmlEntities` after parsing). No `baseSalary` or explicit `url` field was
present on the one posting inspected; the CLI uses the URL it fetched as canonical.

## Access notes: the `Content-Signal` directive

Every Teamtailor tenant's `robots.txt` follows the same template (Disallow: `/app/`,
`/messages/`, `/messenger/`, `/facebook/tab/`, `/jobs/internal/` — none of which affect the
public search/detail paths this CLI uses) **plus a per-tenant `Content-Signal` line**:

```
Content-Signal: search=yes, ai-train=no, ai-input=yes    # career.ivl.se
Content-Signal: search=no, ai-train=no, ai-input=no      # career.ri.se
```

`ai-input` is the relevant flag: it's a directive specifically about AI/agent use of the
site's content, distinct from `search` (classic search-engine indexing) and `ai-train`
(training data use). Confirmed live that this varies tenant-to-tenant on otherwise identical
robots.txt boilerplate — it is a per-customer Teamtailor setting, not a platform default.

**This CLI checks `Content-Signal: ai-input` live for whichever `--site` is passed, before
every `search`/`detail` call** (`checkAiInput()` in `helpers.ts`), and refuses with
`AI_INPUT_DISALLOWED` if a site declares `ai-input=no`. An absent `Content-Signal` line, or
no `robots.txt` at all, defaults to allowed (silence is not an opt-out, matching how a
missing classic `Disallow` is treated) but declared `no` is always honored.

Practical effect: `career.ivl.se` works with this CLI; `career.ri.se` (RISE) does not, even
though RISE postings are otherwise visible via other channels (e.g. they show up in
`arbetsformedlingen-search` results, since Platsbanken aggregates postings regardless of the
originating ATS's AI-access preference).
