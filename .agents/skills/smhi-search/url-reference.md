# SMHI Job Listing URL Reference

SMHI's own career page server-renders its full job list directly into HTML (Sitevision
CMS) - no JS execution or API call needed for search. Each listed role links out to SMHI's
tenant on **ReachMee**, a Swedish/Nordic ATS, for the full ad and application form.
Investigated 2026-08-11.

## Why Swedish, not English

The user explicitly asked to use the Swedish listing page because it carries more open
postings than the English equivalent. This CLI hardcodes the Swedish URL
(`smhi.se/jobba-pa-smhi/lediga-tjanster`) rather than accepting a locale flag - there is no
reason for this skill to ever fetch an English page.

## Search: SMHI's own listing page

```
GET https://www.smhi.se/jobba-pa-smhi/lediga-tjanster
```

`robots.txt` (`www.smhi.se/robots.txt`) does not disallow this path. All currently open roles
render in one page fetch - no pagination markers, "load more" button, or `?page=` param were
found (confirmed live: 8 items on the page, all present in the initial HTML).

### Item shape

Each role is one `<li class="sv-channel-item">`:

```html
<li class="sv-channel-item" style="margin-bottom:1em">
  <div class="smhi-card smhi-card--h smhi-card--article smhi-card--s smhi-card--no-img">
    <div class="smhi-card__content">
      <div class="smhi-card__meta">
        <span class="smhi-card__date">
          <time class="normal" datetime="2026-08-06T23:59:00+02:00">06 augusti 2026</time>
        </span>
      </div>
      <h2 class="subheading">
        <a href="https://web103.reachmee.com/ext/I011/1056/main?site=6&amp;validator=<TOKEN>&amp;lang=SE&amp;rmpage=job&amp;rmjob=834">GIS-utvecklare</a>
      </h2>
      <span class="normal">Vill du jobba för hela samhället och bidra till...</span>
    </div>
  </div>
</li>
```

The numeric job ID is the `rmjob=<id>` query param on the ReachMee link - extracted by
`idFromReachmeeUrl()` in `helpers.ts`.

### The `date`/`<time>` field's real meaning is inferred, not confirmed

All 8 postings observed live had `<time>` values with `23:59:00` time-of-day, ranging from
several days *before* the check date up to the check date itself - consistent with **"sista
ansökningsdag" (application deadline)**, not a posting date. No explicit label (`Sista
ansökningsdag`, `Publicerad`, etc.) was found adjacent to the `<time>` element to confirm this
definitively. The CLI passes this value through as `date` without asserting which it is, and
**does not offer `--jobage` filtering** on it, since "posted within N days" logic would be
wrong if the field is actually a deadline. Treat `date` as "apply by," not "posted on," until
confirmed otherwise.

## Detail: ReachMee job page

```
GET https://web103.reachmee.com/ext/I011/1056/main?site=6&validator=<TOKEN>&lang=SE&rmpage=job&rmjob=<id>
```

307-redirects (confirmed live, `curl -L` follows it fine) to:

```
https://web103.reachmee.com/ext/I011/1056/job?site=6&lang=SE&validator=<TOKEN>&job_id=<id>
```

No `robots.txt` exists on `web103.reachmee.com` (404 - unrestricted by convention).

### The `validator` token is not hardcoded

Every job link on SMHI's listing page carries the same `validator` value (SMHI's ReachMee
tenant token) - but rather than hardcoding it as a magic string that could silently go stale
if SMHI's ReachMee configuration changes, `detail` on a **bare numeric id** re-fetches the
current listing page and reads that job's live URL (including its current validator) from
there. A **full URL** (as returned by `search`) skips this and is fetched directly. This
means a bare id for a since-closed posting (no longer on the listing) correctly returns
`NOT_FOUND` rather than a stale/broken fetch.

### Detail page content

The job description lives in `<div class="jobDescription">...</div>` (confirmed live, full
readable Swedish text, standard `<p>`/entity-encoded HTML) inside `<div class="jobPage">`.
The `<title>` tag is `SMHI | <role title>` - the CLI strips the `SMHI | ` prefix.

## Access notes

- No authentication required for either the listing page or the ReachMee job pages.
- `www.smhi.se/robots.txt` is permissive for `/jobba-pa-smhi/lediga-tjanster` (only unrelated
  paths like `/funktioner/*`, `/dokumentation/*`, and various `?query=` patterns are
  disallowed).
- `web103.reachmee.com` has no `robots.txt` at all.
- SMHI is a Swedish government agency; this is a normal public job-listing page, not a
  scrape of anything access-gated.
