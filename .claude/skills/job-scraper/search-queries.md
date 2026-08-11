# Search Queries for Job Scraper

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** - for portals without a CLI, company career pages, or when a CLI fails.

**Language scope:** queries below are written in English and German, the two languages Jan-Torben works in professionally at a level suited to job search (native/fluent). Swedish is intermediate (SFI D scheduled June 2026) and skipped for query generation for now - revisit once Swedish is stronger, since a meaningful share of target locations are in Sweden. Russian and French are not used for search since neither Sweden nor Germany job search needs them. Translate each category's keywords rather than machine-translating word-for-word (e.g. "Autonomous Systems Engineer" -> "Ingenieur fuer autonome Systeme", not a literal word-for-word translation).

## Search Sites

Primary:
- **linkedin.com/jobs** - LinkedIn job listings (filter: Sweden / Germany); also covered by `linkedin-search` CLI
- **arbetsformedlingen.se** - Sweden's public job board (Platsbanken)
- **indeed.com** - broad coverage in both Sweden and Germany
- **stepstone.de** - major German-market board. WebSearch fallback only - `/add-portal` investigation (2026-08-11) found `robots.txt` explicitly disallows `/public-api/`, the endpoint StepStone's search results load from client-side; no CLI was built. Jan-Torben's own recurring StepStone query is under Query Categories below.

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for target companies: TKMS, Kongsberg, Nortek, Frost Unmanned, Voice of the Ocean, Reach Subsea, Fraunhofer, SMHI, BSH, Rheinmetall
- **TKMS:** `site:jobs.tkmsgroup.com` - WebSearch fallback only. `/add-portal` investigation (2026-08-11) found the careers site's real search/filter/pagination all run through a client-side call to `/api/*`, which `robots.txt` explicitly disallows; the only page reachable without it (`jobs.tkmsgroup.com/en`) always serves the same unfiltered 20-of-265-role snapshot regardless of URL query params, so no CLI was built. Jobs of interest there so far run under the "Engineering & Science" job field (e.g. System Engineer Manager, Systemingenieur Design & Marine Composite Structures) - use `site:jobs.tkmsgroup.com "Systemingenieur" OR "System Engineer" OR "Autonome Systeme" OR "Robotics"` as a starting query.
- **Rheinmetall:** `site:rheinmetall.com/de/karriere` OR `site:rheinmetall.recruitmentplatform.com` - WebSearch fallback only. `/add-portal` investigation (2026-08-11) found `rheinmetall.com/de/karriere/aktuelle-stellenangebote` doesn't embed job data at all - search runs entirely through an embedded third-party ATS widget (TalentLink, on `rheinmetall.recruitmentplatform.com` / `emea3.recruitmentplatform.com`) whose `robots.txt` disallows everything for `user-agent: *`, with only Googlebot allowed a narrow static-asset + `/fo/rest` API carve-out. No CLI was built and no unfiltered snapshot was available either (unlike TKMS). Not yet in Jan-Torben's declared Target Sectors (CLAUDE.md) - flag if it should be added there as a defence-industry option.
- **Ocean Harvesting Technologies:** no query needed - `oceanharvesting.com/career/` (Karlskrona, Sweden; wave energy) has no listing mechanism at all, just a static "submit your interest by email" page (checked 2026-08-11); nothing to search or scrape until that changes.
- **Voice of the Ocean (VOTO):** `site:voiceoftheocean.org/about-us/careers` - no CLI built (checked 2026-08-11). Unlike Ocean Harvesting, `voiceoftheocean.org/about-us/careers/` has a real listing mechanism (a WordPress Query Loop block with Title/Location columns, permissive `robots.txt`) - but it's currently empty ("Sorry! We don't have any open positions right now") and WordPress doesn't render any per-post template markup when there are zero results, so there's nothing to anchor a parser on, not even a guess. Revisit and build `voto-search` once a real posting appears to verify against.

### Teamtailor sites (via `teamtailor-search` CLI, not a `site:` query)

`teamtailor-search` is generic - it works for any company on the Teamtailor ATS via `--site
<domain>`, but needs a domain list to iterate over since `--site` isn't a keyword `/scrape`'s
query-translation step can derive on its own. Confirmed live (2026-08-11):

| Company | Domain | ai-input | Notes |
|---|---|---|---|
| IVL Svenska Miljöinstitutet | `career.ivl.se` | yes | Small (3 open roles at time of check); environmental research, Sweden. |
| Nortek Group | `nortekgroup.teamtailor.com` | yes | Already a declared target company (sensor/current-profiler manufacturer). 1 open role (generic "open application") at time of check. |
| Frost Unmanned | `careers.frostunmanned.com` | yes | Already a declared target company (USV/UAV manufacturer). 0 open roles at time of check - feed is real and correctly wired, just currently empty. |
| Njord Survey | `njordsurvey.teamtailor.com` | yes | Company Jan-Torben is specifically interested in (hydrographic/geophysical offshore survey) - added to CLAUDE.md Target Sectors. 1 open role (generic "Open application") at time of check. |

**Deliberately excluded: RISE (`career.ri.se`).** Confirmed Teamtailor, but its robots.txt
declares `Content-Signal: ai-input=no` (also `search=no`) - an explicit, company-set opt-out
of AI-agent access, distinct from classic crawler rules. `teamtailor-search` refuses to query
it (`AI_INPUT_DISALLOWED`) and no override was built - see the CLI's `url-reference.md` for
why. RISE postings still surface via `arbetsformedlingen-search` (Platsbanken republishes
them under its own terms), or check `career.ri.se` manually in a browser.

**Checked, not confirmed as Teamtailor:** Kongsberg (main careers page and Kongsberg Digital's
`careers.kongsbergdigital.com` didn't resolve/confirm as Teamtailor), Voice of the Ocean - these
stay on the `site:` WebSearch fallback above instead. (Reach Subsea has its own dedicated CLI
now - see below, not Teamtailor.)

Example `/scrape` invocation per company:
```bash
bun run .agents/skills/teamtailor-search/cli/src/cli.ts search -s career.ivl.se --jobage 14 --format json
bun run .agents/skills/teamtailor-search/cli/src/cli.ts search -s nortekgroup.teamtailor.com --jobage 14 --format json
bun run .agents/skills/teamtailor-search/cli/src/cli.ts search -s careers.frostunmanned.com --jobage 14 --format json
bun run .agents/skills/teamtailor-search/cli/src/cli.ts search -s njordsurvey.teamtailor.com --jobage 14 --format json
```

### Workday sites (via `workday-search` CLI, not a `site:` query)

Same idea as the Teamtailor table above, but for Workday-powered career sites
(`myworkdayjobs.com`) via `--site <host/siteId>`. Confirmed live (2026-08-11):

| Company | Site | ai-input | Notes |
|---|---|---|---|
| Husqvarna Group | `husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site` | not declared (defaults to allowed) | 158 open roles at time of check, including "Embedded Software Developer – Robotics R&D Residential" **in Huskvarna** - Jan-Torben's home town, and a strong skills match (C/C++, embedded, sensors, autonomous systems). Added to CLAUDE.md Target Sectors as a non-maritime robotics option. |

Example `/scrape` invocation:
```bash
bun run .agents/skills/workday-search/cli/src/cli.ts search -s husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site --format json
```

## Query Categories

Queries are grouped by priority. Each category is written in English and German (see Language scope above). Combine each query with location terms from the Location Filter below where the site supports it.

### Priority 1: Marine Robotics / Autonomous Systems Engineer

Matches Jan-Torben's strongest and most desired career direction: hands-on development, integration, and field testing of autonomous maritime systems.

```
site:linkedin.com/jobs "Autonomous Systems Engineer" Sweden OR Germany
site:linkedin.com/jobs "Robotics Engineer" marine OR maritime Sweden OR Germany
site:linkedin.com/jobs "ROS" AUV OR ASV Sweden OR Germany
site:indeed.com "Marine Robotics Engineer"
site:linkedin.com/jobs "Ingenieur fuer autonome Systeme" maritim Deutschland
site:linkedin.com/jobs "Robotik Ingenieur" maritim Deutschland
```

### Priority 2: Hydrographic Survey / Geospatial (GIS)

Matches Jan-Torben's domain expertise (bathymetric surveying, sensor fusion) and current GIS upskilling.

```
site:linkedin.com/jobs "Hydrographic Surveyor" Sweden OR Germany OR Denmark
site:linkedin.com/jobs "Survey Engineer" maritime OR offshore Sweden OR Germany
site:linkedin.com/jobs "GIS" "geospatial" survey Sweden OR Germany
site:linkedin.com/jobs "Hydrograph" Vermessung Deutschland
site:linkedin.com/jobs "Geodaet" maritim OR Gewaesser Deutschland
```

### Priority 3: Applied Research / Government Agency Roles

Adjacent roles Jan-Torben could pivot into: continuing in research or moving into a government agency (SMHI, BSH) rather than industry.

```
site:linkedin.com/jobs "Research Associate" oceanography OR "marine robotics" Sweden OR Germany
site:linkedin.com/jobs "Forschungsingenieur" maritim OR Meerestechnik Deutschland
site:bsh.de Stellenangebote
```

**SMHI now has a dedicated CLI (`smhi-search`, added 2026-08-11)** - it fetches SMHI's own
Swedish-language listing page directly, which carries more open postings than the English
equivalent. Prefer it over the `site:smhi.se` WebSearch query above:
```bash
bun run .agents/skills/smhi-search/cli/src/cli.ts search --format table
```

### Priority 4: Broader Maritime Data / Offshore / Defence

Wider net, including sectors Jan-Torben is open to if needed to stay in the maritime field.

```
site:linkedin.com/jobs "maritime data" engineer Sweden OR Germany
site:linkedin.com/jobs "offshore survey" engineer Sweden OR Norway OR Germany
site:linkedin.com/jobs "unmanned surface vehicle" OR "uncrewed surface vehicle" engineer
site:linkedin.com/jobs Verteidigung OR defence maritim OR maritime Ingenieur
```

**Reach Subsea now has a dedicated CLI (`reachsubsea-search`, added 2026-08-11)** - it fetches
their own careers page directly (their ATS vendor, Talentech/HR-Manager, doesn't expose a
public search API - see the skill's `url-reference.md`). Only 1 role open at time of setup.
Prefer it over the generic `site:` fallback in the Secondary list above:
```bash
bun run .agents/skills/reachsubsea-search/cli/src/cli.ts search --format table
```

### StepStone (Germany): Jan-Torben's recurring combined query

No CLI - see the Search Sites note above. This is the exact boolean query Jan-Torben runs
directly on stepstone.de (its search box supports `OR`), spanning research, data-science,
and marine-robotics roles in one pass. Reuse it as-is on stepstone.de, or prefix with
`site:stepstone.de` for the WebSearch fallback path:

```
Data Scientist Engineer OR Data Scientist OR Junior Data Scientist OR Wissenschaftliche/r Referent/in OR Wissenschaftliche/r Mitarbeiter/in OR Marine Technik OR Robotics Engineer OR Robotics Software Engineer OR Ozeanographie OR Autonome Fahrzeuge OR Applied Scientist OR Autonomes System OR Data Science OR Data Engineer OR GIS-Daten OR Sensorik OR Sensor OR Sensordaten in Rostock OR Hamburg OR Lübeck OR Kiel OR Wismar
```

## Location Filter

Jan-Torben is currently based in Jönköping/Huskvarna, Sweden, and open to relocation for the right opportunity. When evaluating results, use these tiers:

- **Ideal:** Jönköping / Huskvarna and surrounding area (current home base)
- **Acceptable:** Gothenburg and surrounding area; Halmstad and surrounding area; Helsingborg area; Karlshamn; Karlskrona; Copenhagen-Malmoe (Oeresund) area; Hamburg area; Luebeck; Kiel; Rostock; Wismar
- **Borderline:** Other locations within Sweden or Germany, considered case by case for the right opportunity
- **Too far:** None hard-excluded - remote locations or long-distance relocation are considered case by case, weighed against the soft preference to avoid long offshore stints away from family (see Deal-breakers in CLAUDE.md)

## Language Filter

Jan-Torben's working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language he hasn't declared at all is excluded; a posting requiring a higher level than declared in a language he does work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language he doesn't work in, that don't require it on the job, are fine - this matters especially for Swedish-language postings where the role itself may only require English.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape offshore" -> Priority 4 category queries + custom offshore-specific queries
- "/scrape GIS" -> Priority 2 category queries + custom geospatial-specific queries
