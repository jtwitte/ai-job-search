import { describe, expect, test } from "bun:test";
import { parseDetail, parseListing } from "../src/helpers";

describe("parseListing", () => {
  const listingHtml = `
  <ul>
  <li class="sv-channel-item" style="margin-bottom:1em">
    <div class="smhi-card">
      <div class="smhi-card__content">
        <div class="smhi-card__meta">
          <span class="smhi-card__date">
            <time class="normal" datetime="2026-08-06T23:59:00+02:00">06 augusti 2026</time>
          </span>
        </div>
        <h2 class="subheading"><a href="https://web103.reachmee.com/ext/I011/1056/main?site=6&amp;validator=abc123&amp;lang=SE&amp;rmpage=job&amp;rmjob=834">GIS-utvecklare</a></h2>
        <span class="normal">Vill du jobba med GIS och hydrologi?</span>
      </div>
    </div>
  </li>
  <li class="sv-channel-item" style="margin-bottom:1em">
    <div class="smhi-card">
      <div class="smhi-card__content">
        <h2 class="subheading"><a href="https://web103.reachmee.com/ext/I011/1056/main?site=6&amp;validator=abc123&amp;lang=SE&amp;rmpage=job&amp;rmjob=832">IT-s&#xE4;kerhetsarkitekt</a></h2>
        <span class="normal">S&#xE4;kerhetsarbete p&#xE5; SMHI.</span>
      </div>
    </div>
  </li>
  </ul>`;

  test("parses each item with the required output shape", () => {
    const results = parseListing(listingHtml);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "834",
      title: "GIS-utvecklare",
      company: "SMHI",
      location: null,
      date: "2026-08-06T23:59:00+02:00",
      url: "https://web103.reachmee.com/ext/I011/1056/main?site=6&validator=abc123&lang=SE&rmpage=job&rmjob=834",
      summary: "Vill du jobba med GIS och hydrologi?",
    });
  });

  test("decodes HTML entities in title and summary", () => {
    const results = parseListing(listingHtml);
    expect(results[1].title).toBe("IT-säkerhetsarkitekt");
    expect(results[1].summary).toBe("Säkerhetsarbete på SMHI.");
  });

  test("missing date/summary become null, never omitted", () => {
    const results = parseListing(listingHtml);
    expect(results[1].date).toBeNull();
    expect(Object.keys(results[1])).toContain("date");
  });

  test("a malformed item (no title link) is skipped without breaking the rest", () => {
    const withMalformed = `<li class="sv-channel-item"><div>no link here</div></li>` + listingHtml;
    const results = parseListing(withMalformed);
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.title === "GIS-utvecklare")).toBe(true);
  });
});

describe("parseDetail", () => {
  // Real ReachMee pages serve literal UTF-8 (confirmed live), not named HTML
  // entities for accented characters - only structural entities like &amp;
  // are entity-encoded. This fixture matches that.
  const html = `<html><head><title>SMHI | GIS-utvecklare</title></head>
    <body><div class="jobPage"><div class="jobDescription">
      <p>Vill du jobba för hela samhället?</p>
      <p>Gemensamt för oss på SMHI &amp; SVAR.</p>
    </div></div></body></html>`;

  test("extracts title (with SMHI prefix stripped) and description", () => {
    const job = parseDetail(html, "834", "https://web103.reachmee.com/ext/I011/1056/job?rmjob=834");
    expect(job.id).toBe("834");
    expect(job.title).toBe("GIS-utvecklare");
    expect(job.company).toBe("SMHI");
    expect(job.description).toContain("Vill du jobba för hela samhället?");
    expect(job.description).toContain("SMHI & SVAR");
    expect(job.description).not.toContain("<p>");
  });
});
