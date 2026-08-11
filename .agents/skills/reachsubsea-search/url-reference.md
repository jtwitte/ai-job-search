# Reach Subsea Careers URL Reference

Reach Subsea's own WordPress careers page server-renders its open positions directly into
HTML (a block literally classed `rss-feed-careers`) - no JS execution needed for search.
Each posting links to Reach Subsea's ATS vendor, **Talentech / HR-Manager**, for the full ad
text. Investigated 2026-08-11.

## Search: Reach Subsea's own listing page

```
GET https://reachsubsea.no/careers/
```

`reachsubsea.no/robots.txt` has no disallows at all (`User-agent: * / Disallow:` - empty),
just `Crawl-delay: 10` (respected by keeping request volume low, same as everywhere else in
this repo). Only **one role was open at time of testing** ("Senior Project Manager,"
Haugesund), so the multi-item splitting logic in `parseListing()` is confirmed against one
real card and exercised further only via a same-shape synthetic second card in
`tests/mapping.test.ts` - re-verify against real data once Reach Subsea has 2+ open roles.

### Item shape

```html
<div class="rss-feed-careers">
  <a href="https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&amp;ProjectId=66974&amp;DepartmentId=8562&amp;MediaId=5">
    <h2 class="h4">Senior Project Manager</h2>
    <div class="rss-feed-careers__workplace">
      <bold>Workplace</bold>
      <p> Haugesund, Norway</p>
    </div>
    <div class="rss-feed-careers__due">
      <bold>Application due</bold>
      <p> 13.09.26</p>
    </div>
    <div class="wp-block-button">...Apply here...</div>
  </a>
</div>
```

The apply link's `ProjectId` query param is the job's stable id. `cid=1021` is Reach
Subsea's fixed HR-Manager customer id - confirmed constant across the one live posting
inspected, and treated as a permanent per-tenant identifier (hardcoded in `helpers.ts`),
unlike SMHI's ReachMee "validator" (which this repo's `smhi-search` deliberately does *not*
hardcode, since that one behaves more like a rotatable session/tenant token - see that
skill's `url-reference.md` for the distinction). `DepartmentId`/`MediaId` vary per posting
and aren't derivable from `ProjectId` alone.

## Detail: Talentech / HR-Manager ad page

```
GET https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&ProjectId=<id>&DepartmentId=<deptId>&MediaId=<mediaId>
```

`candidate.hr-manager.net/robots.txt`:

```
User-agent: *
Allow: /ApplicationInit.aspx?
Disallow: /ApplicationInit.aspx?*SkipAdvertisement=True*
Disallow: /
```

A blanket disallow for everything **except** an explicit `Allow` carve-out for exactly the
job-ad path this CLI uses (without the `SkipAdvertisement=True` variant, which the CLI never
passes) - the most specific rule wins, so this usage is explicitly permitted, not merely
un-disallowed.

### Detail page content

Confirmed live: the real ad title and body are server-rendered in

```html
<div class="AdContentContainer">
  <div class="ProjectName">Senior Project Manager <br></div>
  <div id="AdvertisementInnerContent">
    <p>Reach Subsea is looking for an experienced <strong>Senior Project Manager</strong>...</p>
    ...
  </div>
</div>
```

`AdvertisementInnerContent` contains nested `<div>`s in general (ASP.NET Web Forms markup),
so it's extracted with a depth-tracking scan (`extractDivById()` in `helpers.ts`, the same
technique as `linkedin-search`'s `extractDivContent`), not a naive non-greedy regex which
would truncate at the first inner `</div>`.

No separately-labeled location/deadline fields were found on the detail page itself (unlike
the listing page's `workplace`/`due` divs) - `detail`'s output is title + description + url
only; location/deadline come from `search` results.

## Access notes

- No authentication required for either the listing page or the HR-Manager ad page.
- `reachsubsea.no/robots.txt`: fully permissive, `Crawl-delay: 10` only.
- `candidate.hr-manager.net/robots.txt`: blanket-disallowed except an explicit `Allow` for
  the exact ad-page path pattern this CLI uses.
- No `Content-Signal` (`ai-input`) directive was found on either host, unlike Teamtailor/
  some Workday tenants - not applicable here.
