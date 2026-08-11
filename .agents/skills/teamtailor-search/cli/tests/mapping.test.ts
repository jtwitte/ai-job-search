import { afterEach, describe, expect, test } from "bun:test";
import {
  checkAiInput,
  jobageToCutoff,
  normalizeSite,
  parseJobPostingLd,
  parseRssFeed,
} from "../src/helpers";

describe("normalizeSite", () => {
  test("strips scheme and path, keeps bare host", () => {
    expect(normalizeSite("career.ivl.se")).toBe("career.ivl.se");
    expect(normalizeSite("https://career.ivl.se")).toBe("career.ivl.se");
    expect(normalizeSite("https://career.ivl.se/en-GB")).toBe("career.ivl.se");
    expect(normalizeSite("https://career.ivl.se/jobs/123-slug")).toBe("career.ivl.se");
  });
});

describe("parseRssFeed", () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/locations">
  <channel>
    <title>Test Company AB </title>
    <description>Job Openings</description>
    <link>https://career.example.com/jobs</link>
    <item>
      <title>Robotics Engineer</title>
      <description>&lt;p&gt;Build &lt;strong&gt;autonomous&lt;/strong&gt; things.&lt;/p&gt;</description>
      <pubDate>Mon, 10 Aug 2026 12:00:00 +0200</pubDate>
      <link>https://career.example.com/jobs/111111-robotics-engineer</link>
      <remoteStatus>hybrid</remoteStatus>
      <guid>abc-123</guid>
      <tt:locations>
        <tt:location>
          <tt:name>Gothenburg, Sweden</tt:name>
          <tt:city>Gothenburg</tt:city>
          <tt:country>Sweden</tt:country>
        </tt:location>
      </tt:locations>
      <tt:department>Engineering</tt:department>
    </item>
    <item>
      <title>Finance Controller</title>
      <description>&lt;p&gt;Numbers.&lt;/p&gt;</description>
      <pubDate>Tue, 01 Jan 2020 12:00:00 +0200</pubDate>
      <link>https://career.example.com/jobs/222222-finance-controller</link>
      <guid>def-456</guid>
      <tt:department>Finance</tt:department>
    </item>
  </channel>
</rss>`;

  test("parses each item with the required output shape", () => {
    const parsed = parseRssFeed(feed);
    expect(parsed).toHaveLength(2);
    const [first] = parsed;
    expect(first.result).toEqual({
      id: "111111",
      title: "Robotics Engineer",
      company: "Test Company AB",
      location: "Gothenburg, Sweden",
      date: "Mon, 10 Aug 2026 12:00:00 +0200",
      url: "https://career.example.com/jobs/111111-robotics-engineer",
      department: "Engineering",
      remote: "hybrid",
    });
  });

  test("missing fields become null, never omitted", () => {
    const parsed = parseRssFeed(feed);
    const second = parsed[1].result;
    expect(second.location).toBeNull();
    expect(second.remote).toBeNull();
    expect(Object.keys(second)).toContain("location");
    expect(Object.keys(second)).toContain("remote");
  });

  test("searchText includes stripped description for keyword matching", () => {
    const parsed = parseRssFeed(feed);
    expect(parsed[0].searchText).toContain("autonomous");
    expect(parsed[0].searchText).toContain("engineering");
  });

  test("malformed item (no title) is skipped without breaking the rest", () => {
    const withMalformed = feed.replace(
      "<item>\n      <title>Finance Controller</title>",
      "<item>\n      <title></title>",
    );
    const parsed = parseRssFeed(withMalformed);
    // The malformed item has an empty title (falsy) so it's dropped; the well-formed one survives.
    expect(parsed.some((p) => p.result.title === "Robotics Engineer")).toBe(true);
  });
});

describe("parseJobPostingLd", () => {
  const url = "https://career.example.com/jobs/111111-robotics-engineer";
  const html = `<html><head>
    <script type="application/ld+json">
    {"@context":"http://schema.org/","@type":"JobPosting","title":"Robotics Engineer","identifier":{"@type":"PropertyValue","value":"111111"},"datePosted":"2026-08-10T00:00:00+02:00","employmentType":"FULL_TIME","hiringOrganization":{"@type":"Organization","name":"Test Company AB "},"validThrough":"2026-09-01 23:59:59 +0200","description":"&lt;p&gt;Build &lt;strong&gt;autonomous&lt;/strong&gt; things.&lt;/p&gt;","jobLocation":[{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Gothenburg","addressRegion":"Vastra Gotaland","addressCountry":"SE"}}]}
    </script>
  </head><body></body></html>`;

  test("extracts a full JobDetail from the JSON-LD block", () => {
    const job = parseJobPostingLd(html, url);
    expect(job).not.toBeNull();
    expect(job?.id).toBe("111111");
    expect(job?.title).toBe("Robotics Engineer");
    expect(job?.company).toBe("Test Company AB");
    expect(job?.location).toBe("Gothenburg, Vastra Gotaland");
    expect(job?.employmentType).toBe("FULL_TIME");
    expect(job?.description).toContain("autonomous");
    expect(job?.description).not.toContain("<strong>");
  });

  test("returns null when no JobPosting JSON-LD is present", () => {
    const job = parseJobPostingLd("<html><body>nothing here</body></html>", url);
    expect(job).toBeNull();
  });
});

describe("jobageToCutoff", () => {
  test("undefined/0/negative/huge -> null (no filter)", () => {
    expect(jobageToCutoff(undefined)).toBeNull();
    expect(jobageToCutoff(0)).toBeNull();
    expect(jobageToCutoff(-1)).toBeNull();
    expect(jobageToCutoff(9999)).toBeNull();
  });

  test("N days returns a Date N days before today", () => {
    const cutoff = jobageToCutoff(14);
    const expected = new Date();
    expected.setDate(expected.getDate() - 14);
    expect(cutoff?.toDateString()).toBe(expected.toDateString());
  });
});

describe("checkAiInput", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubRobots(body: string | null, status = 200) {
    globalThis.fetch = (async () =>
      body === null ? new Response("", { status: 404 }) : new Response(body, { status })) as unknown as typeof fetch;
  }

  test("ai-input=yes is allowed and declared", async () => {
    stubRobots("User-Agent: *\nDisallow: /app/\nContent-Signal: search=yes, ai-train=no, ai-input=yes\n");
    const result = await checkAiInput("career.ivl.se");
    expect(result).toEqual({ allowed: true, declared: true, raw: "search=yes, ai-train=no, ai-input=yes" });
  });

  test("ai-input=no is disallowed and declared", async () => {
    stubRobots("User-Agent: *\nDisallow: /app/\nContent-Signal: search=no, ai-train=no, ai-input=no\n");
    const result = await checkAiInput("career.ri.se");
    expect(result.allowed).toBe(false);
    expect(result.declared).toBe(true);
  });

  test("no robots.txt at all defaults to allowed, undeclared", async () => {
    stubRobots(null);
    const result = await checkAiInput("career.example.com");
    expect(result).toEqual({ allowed: true, declared: false, raw: null });
  });

  test("robots.txt present but no Content-Signal line defaults to allowed, undeclared", async () => {
    stubRobots("User-Agent: *\nDisallow: /app/\n");
    const result = await checkAiInput("career.example.com");
    expect(result).toEqual({ allowed: true, declared: false, raw: null });
  });
});
