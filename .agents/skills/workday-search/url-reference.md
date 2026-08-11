# Workday CXS API Reference

Public, unauthenticated JSON API exposed by any Workday-powered career site. Workday is a
multi-tenant ATS — the same endpoint shapes work for every customer, only the host/tenant/
siteId (`--site`) changes. Investigated 2026-08-11 against Husqvarna Group
(`husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site`).

## Identifying host, tenant, siteId

A Workday career site URL looks like:

```
https://<tenant>.<pod>.myworkdayjobs.com/<locale>/<siteId>
```

e.g. `https://husqvarnagroup.wd3.myworkdayjobs.com/en-US/External_Career_Site` - `<pod>` is
an internal Workday instance identifier (`wd1`, `wd3`, `wd5`, ... - varies per tenant, not
guessable, must come from the tenant's own career-site URL). Confirmed live: the API's
`tenant` path segment always matches the host's first label (`husqvarnagroup` in both
places) - `normalizeSite()` in `helpers.ts` derives it that way rather than requiring a
separate flag. The `<locale>` segment (`en-US`) is optional and ignored - the API itself
needs no locale, only `host` + `siteId`.

## Search

```
POST https://<host>/wday/cxs/<tenant>/<siteId>/jobs
Content-Type: application/json

{"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "Robotics"}
```

- `searchText` is free text, matched server-side against title, location text, **and the
  requisition id** (confirmed live: `searchText: "R-17833"` returns exactly that one
  posting) - `detail`'s bare-id resolution relies on this.
- `limit`/`offset` are true server-side pagination (confirmed live: different `offset`
  values return different postings, not the same page repeated).
- `appliedFacets` supports real server-side faceted filtering (`remoteType`,
  `jobFamilyGroup`, `Worker_Type`, `timeType`, and a nested `locationMainGroup` with
  Country/State/City/Remote sub-facets), but the facet `id` values are opaque per-tenant
  hashes (e.g. `37f6753299e61000a1e2ff53badc0000` for "Hybrid") that would need a separate
  lookup call per tenant to resolve. This CLI skips `appliedFacets` entirely and combines
  `--location`/`--query` into `searchText` instead - the ROI on scraping the facet-id
  hierarchy per tenant didn't justify it for a personal job-search tool.

### Response shape (search)

```jsonc
{
  "total": 158,
  "jobPostings": [
    {
      "title": "Embedded Software Developer – Robotics R&D Residential – Husqvarna Group",
      "externalPath": "/job/Huskvarna/Embedded-Software-Developer---Robotics-R-D-Residential---Husqvarna-Group_R-17833",
      "locationsText": "Huskvarna",
      "postedOn": "Posted Yesterday",
      "remoteType": "Hybrid",           // absent on many postings - optional field
      "bulletFields": ["R-17833"]       // [0] is the requisition id
    }
  ],
  "facets": [ /* see above */ ]
}
```

**`postedOn` is relative text** ("Posted Today", "Posted Yesterday", "Posted 4 Days Ago"),
not an ISO date - the list API doesn't expose one. `detail`'s `startDate`/`endDate` *are*
ISO dates, but only after fetching a specific posting. The CLI passes `postedOn` through
as-is in `date` without pretending it's more precise than it is.

**No `company` field on list items.** The employer name only appears in the detail
response's `hiringOrganization.name`. `toJobResult()` sets `company: null` on search
results rather than guessing from the tenant string.

**`externalPath` excludes the siteId** ("/job/..." not "/siteId/job/..."), because it's
meant to be appended to the API base which already scopes to that siteId. The *public* URL
a human would visit (and what `detail`'s `externalUrl` returns) needs the siteId prefixed:
`https://<host>/<siteId><externalPath>`. Confirmed live: the version without siteId 404s.
`toJobResult()` builds the URL with siteId included - **verify this if extending the
parser**, it's an easy field to get subtly wrong.

## Detail

```
GET https://<host>/wday/cxs/<tenant>/<siteId><externalPath>
```

e.g. `.../wday/cxs/husqvarnagroup/External_Career_Site/job/Huskvarna/...-R-17833`. A **bare
requisition id alone 404s** (confirmed live: `/job/R-17833` fails) - the full slugged path
from a search result is required. Since that slug isn't derivable from the id, `detail` on
a bare id re-searches with `searchText: "<id>"` to find the matching `externalPath`
(exact match on `bulletFields[0]`) rather than guessing at slug format.

### Response shape (detail)

```jsonc
{
  "jobPostingInfo": {
    "title": "Embedded Software Developer – Robotics R&D Residential – Husqvarna Group",
    "jobDescription": "<p>...HTML, HTML-entity-escaped...</p>",
    "location": "Huskvarna",
    "postedOn": "Posted Yesterday",
    "startDate": "2026-08-10",         // ISO date - the real posting date
    "endDate": "2026-08-31",           // ISO date - the application deadline
    "timeType": "Full time",
    "jobReqId": "R-17833",
    "externalUrl": "https://husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site/job/Huskvarna/...-R-17833"
  },
  "hiringOrganization": { "name": "Husqvarna AB (publ)", "url": "" }
}
```

`jobDescription` is raw HTML (entity-escaped `&amp;`/`&#39;`/etc.) - stripped and decoded by
the CLI the same way as every other HTML-description skill in this repo.

## Access notes

- No authentication or API key required for either endpoint.
- Husqvarna's `robots.txt` (`husqvarnagroup.wd3.myworkdayjobs.com/robots.txt`) explicitly
  `Allow: /External_Career_Site/`, only disallowing `/refreshFacet/` (an internal
  AJAX facet-refresh endpoint this CLI doesn't use) - more permissive than most portals
  investigated this session. No `Content-Signal` line was present.
- The Content-Signal check is still run live per `--site` (see `checkAiInput()` in
  `helpers.ts`, shared design with `teamtailor-search`) in case another Workday tenant sets
  one - Workday itself doesn't appear to set a platform default either way, it's whatever
  each tenant's robots.txt happens to declare (or, as with Husqvarna, doesn't).
