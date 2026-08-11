import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke test against a real Teamtailor tenant (career.ivl.se, which
// declares ai-input=yes) — no auth, low volume: one search + one detail
// lookup. Skippable via `LIVE=0 bun test` in CI/offline.
const LIVE = process.env.LIVE !== "0";
const describeLive = LIVE ? describe : describe.skip;

describeLive("live: search + detail against career.ivl.se", () => {
  test("search with no filter returns real, complete results", async () => {
    const result = await runCLI(["search", "-s", "career.ivl.se", "--format", "json"]);
    const data = parseJSON<{ meta: { count: number; total: number }; results: Array<Record<string, unknown>> }>(result);

    expect(result.exitCode).toBe(0);
    expect(data.results.length).toBeGreaterThan(0);
    const first = data.results[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(String(first.url)).toContain("career.ivl.se");
  });

  test("keyword filter narrows results", async () => {
    const result = await runCLI(["search", "-s", "career.ivl.se", "-q", "avlopp", "--format", "json"]);
    const data = parseJSON<{ results: Array<{ title: string }> }>(result);
    expect(result.exitCode).toBe(0);
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results.some((r) => /avlopp/i.test(r.title))).toBe(true);
  });

  test("detail on a real id from search returns a readable description", async () => {
    const searchResult = await runCLI(["search", "-s", "career.ivl.se", "--limit", "1", "--format", "json"]);
    const searchData = parseJSON<{ results: Array<{ id: string }> }>(searchResult);
    expect(searchData.results.length).toBeGreaterThan(0);
    const id = searchData.results[0].id;

    const detailResult = await runCLI(["detail", id, "-s", "career.ivl.se", "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(50);
    expect(detailResult.stdout).not.toMatch(/<[a-z]+>/i); // no leftover HTML tags
  });

  test("a real site that opts out (ai-input=no) is refused", async () => {
    const result = await runCLI(["search", "-s", "career.ri.se", "--format", "json"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("AI_INPUT_DISALLOWED");
  });
});
