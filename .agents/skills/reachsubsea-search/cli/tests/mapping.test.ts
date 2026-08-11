import { describe, expect, test } from "bun:test";
import { detailUrl, extractDivById, parseDetail, parseListing } from "../src/helpers";

// The listing fixture below reproduces the exact markup confirmed live for
// Reach Subsea's one real posting at setup time (2026-08-11), then repeats
// the same card shape a second time with different values to exercise the
// multi-item splitting logic - only the first card's exact structure is
// confirmed against production; the second is a same-shape synthetic case.
const listingHtml = `
<section class="section section--small--margin">
    <div class="rss-feed-careers">
        <a href="https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&amp;ProjectId=66974&amp;DepartmentId=8562&amp;MediaId=5">
            <h2 class="h4">
                Senior Project Manager
            </h2>
            <div class="rss-feed-careers__workplace">
                <bold>Workplace</bold>
                <p> Haugesund, Norway</p>
            </div>
            <div class="rss-feed-careers__due">
                <bold>Application due</bold>
                <p> 13.09.26</p>
            </div>
            <div class="wp-block-button">
                <div class="wp-block-button__link">Apply here</div>
            </div>
        </a>
    </div>
    <div class="rss-feed-careers">
        <a href="https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&amp;ProjectId=70001&amp;DepartmentId=8562&amp;MediaId=5">
            <h2 class="h4">
                ROV Pilot Technician
            </h2>
            <div class="rss-feed-careers__workplace">
                <bold>Workplace</bold>
                <p> Aberdeen, UK</p>
            </div>
            <div class="rss-feed-careers__due">
                <bold>Application due</bold>
                <p> 01.10.26</p>
            </div>
        </a>
    </div>
</section>`;

describe("parseListing", () => {
  test("parses each item with the required output shape", () => {
    const results = parseListing(listingHtml);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: "66974",
      title: "Senior Project Manager",
      company: "Reach Subsea",
      location: "Haugesund, Norway",
      date: "13.09.26",
      url: "https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&ProjectId=66974&DepartmentId=8562&MediaId=5",
    });
    expect(results[1].id).toBe("70001");
    expect(results[1].title).toBe("ROV Pilot Technician");
  });

  test("missing workplace/due become null, never omitted", () => {
    const minimal = `<a href="https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&amp;ProjectId=99&amp;MediaId=5"><h2 class="h4">Bare Role</h2></a>`;
    const results = parseListing(minimal);
    expect(results).toHaveLength(1);
    expect(results[0].location).toBeNull();
    expect(results[0].date).toBeNull();
    expect(Object.keys(results[0])).toContain("location");
    expect(Object.keys(results[0])).toContain("date");
  });

  test("a malformed item (no ProjectId in the href) is skipped without breaking the rest", () => {
    const withMalformed = `<a href="https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021"><h2 class="h4">No Project Id</h2></a>` + listingHtml;
    const results = parseListing(withMalformed);
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.title === "Senior Project Manager")).toBe(true);
  });
});

describe("detailUrl", () => {
  test("builds a full ApplicationInit.aspx URL with the fixed cid", () => {
    expect(detailUrl({ projectId: "66974", departmentId: "8562", mediaId: "5" })).toBe(
      "https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&ProjectId=66974&DepartmentId=8562&MediaId=5",
    );
  });

  test("omits absent optional params", () => {
    expect(detailUrl({ projectId: "66974", departmentId: null, mediaId: null })).toBe(
      "https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&ProjectId=66974",
    );
  });
});

describe("extractDivById", () => {
  test("extracts content across nested divs by tracking depth", () => {
    const html = `<div id="AdvertisementInnerContent"><p>Outer <div class="x">Inner</div> text</p></div><div>unrelated</div>`;
    const content = extractDivById(html, "AdvertisementInnerContent");
    expect(content).toBe('<p>Outer <div class="x">Inner</div> text</p>');
  });

  test("returns null when the id is absent", () => {
    expect(extractDivById("<div>no match here</div>", "AdvertisementInnerContent")).toBeNull();
  });
});

describe("parseDetail", () => {
  const html = `<html><body>
    <div id="bigbox"><div id="column1">
    <div class="AdContentContainer">
    <div class="ProjectName">Senior Project Manager <br></div>
    <div id="AdvertisementInnerContent">
      <p>Reach Subsea is looking for an experienced <strong>Senior Project Manager</strong>.</p>
    </div>
    </div>
    </div></div>
  </body></html>`;

  test("extracts title (br stripped) and plain-text description", () => {
    const job = parseDetail(html, "66974", "https://candidate.hr-manager.net/ApplicationInit.aspx?cid=1021&ProjectId=66974");
    expect(job.id).toBe("66974");
    expect(job.title).toBe("Senior Project Manager");
    expect(job.company).toBe("Reach Subsea");
    expect(job.description).toContain("Senior Project Manager");
    expect(job.description).not.toContain("<strong>");
  });
});
