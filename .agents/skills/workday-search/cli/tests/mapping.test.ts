import { afterEach, describe, expect, test } from "bun:test";
import { checkAiInput, normalizeSite, toJobDetail, toJobResult, type Site } from "../src/helpers";

describe("normalizeSite", () => {
  test("host + siteId, no locale", () => {
    expect(normalizeSite("husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site")).toEqual({
      host: "husqvarnagroup.wd3.myworkdayjobs.com",
      tenant: "husqvarnagroup",
      siteId: "External_Career_Site",
    });
  });

  test("host + locale + siteId (only the last segment is used as siteId)", () => {
    expect(normalizeSite("husqvarnagroup.wd3.myworkdayjobs.com/en-US/External_Career_Site")).toEqual({
      host: "husqvarnagroup.wd3.myworkdayjobs.com",
      tenant: "husqvarnagroup",
      siteId: "External_Career_Site",
    });
  });

  test("strips a leading https:// scheme", () => {
    expect(normalizeSite("https://husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site")).toEqual({
      host: "husqvarnagroup.wd3.myworkdayjobs.com",
      tenant: "husqvarnagroup",
      siteId: "External_Career_Site",
    });
  });

  test("returns null when no siteId segment is present", () => {
    expect(normalizeSite("husqvarnagroup.wd3.myworkdayjobs.com")).toBeNull();
    expect(normalizeSite("husqvarnagroup.wd3.myworkdayjobs.com/")).toBeNull();
  });
});

describe("toJobResult", () => {
  const site: Site = { host: "husqvarnagroup.wd3.myworkdayjobs.com", tenant: "husqvarnagroup", siteId: "External_Career_Site" };

  test("maps a raw posting to the required output shape", () => {
    const result = toJobResult(
      {
        title: "Embedded Software Developer – Robotics R&D",
        externalPath: "/job/Huskvarna/Embedded-Software-Developer_R-17833",
        locationsText: "Huskvarna",
        postedOn: "Posted Yesterday",
        remoteType: "Hybrid",
        bulletFields: ["R-17833"],
      },
      site,
    );
    expect(result).toEqual({
      id: "R-17833",
      title: "Embedded Software Developer – Robotics R&D",
      company: null,
      location: "Huskvarna",
      date: "Posted Yesterday",
      url: "https://husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site/job/Huskvarna/Embedded-Software-Developer_R-17833",
      remote: "Hybrid",
    });
  });

  test("missing optional fields become null, never omitted, and id falls back to externalPath", () => {
    const result = toJobResult({ title: "Some Role", externalPath: "/job/Remote/Some-Role_R-1" }, site);
    expect(result.id).toBe("/job/Remote/Some-Role_R-1");
    expect(result.location).toBeNull();
    expect(result.date).toBeNull();
    expect(result.remote).toBeNull();
    expect(Object.keys(result)).toContain("location");
    expect(Object.keys(result)).toContain("remote");
  });
});

describe("toJobDetail", () => {
  test("extracts fields and strips HTML from the description", () => {
    const raw = {
      jobPostingInfo: {
        title: "GIS-utvecklare",
        jobDescription: "<p>Vill du jobba med <b>GIS</b>?</p>",
        location: "Huskvarna",
        startDate: "2026-08-10",
        endDate: "2026-08-31",
        timeType: "Full time",
        jobReqId: "R-17833",
        externalUrl: "https://husqvarnagroup.wd3.myworkdayjobs.com/External_Career_Site/job/Huskvarna/...-R-17833",
      },
      hiringOrganization: { name: "Husqvarna AB (publ)" },
    };
    const job = toJobDetail(raw, "https://fallback.example.com/job/x");
    expect(job.id).toBe("R-17833");
    expect(job.company).toBe("Husqvarna AB (publ)");
    expect(job.description).toBe("Vill du jobba med GIS?");
    expect(job.url).toContain("husqvarnagroup.wd3.myworkdayjobs.com");
  });

  test("falls back to the passed URL when externalUrl is absent, and nulls for missing fields", () => {
    const raw = { jobPostingInfo: { title: "Role", jobDescription: "" } };
    const job = toJobDetail(raw, "https://fallback.example.com/job/x");
    expect(job.url).toBe("https://fallback.example.com/job/x");
    expect(job.company).toBeNull();
    expect(job.location).toBeNull();
    expect(job.deadline).toBeNull();
    expect(job.description).toBeNull();
  });
});

describe("checkAiInput", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubRobots(body: string | null) {
    globalThis.fetch = (async () =>
      body === null ? new Response("", { status: 404 }) : new Response(body, { status: 200 })) as unknown as typeof fetch;
  }

  test("ai-input=no is disallowed and declared", async () => {
    stubRobots("User-Agent: *\nContent-Signal: search=no, ai-train=no, ai-input=no\n");
    const result = await checkAiInput("example.wd3.myworkdayjobs.com");
    expect(result.allowed).toBe(false);
    expect(result.declared).toBe(true);
  });

  test("no Content-Signal line (Husqvarna's actual robots.txt shape) defaults to allowed", async () => {
    stubRobots("Sitemap: https://example.wd3.myworkdayjobs.com/Careers/siteMap.xml\n\nUser-agent: *\nAllow: /Careers/\nDisallow: /refreshFacet/");
    const result = await checkAiInput("example.wd3.myworkdayjobs.com");
    expect(result).toEqual({ allowed: true, declared: false, raw: null });
  });
});
