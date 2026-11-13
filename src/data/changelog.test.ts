import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { CHANGELOG, LATEST } from "./changelog";

describe("novidades", () => {
  it("a versão do app tem entrada nas novidades (a mais nova primeiro)", () => {
    expect(LATEST.version).toBe(pkg.version);
    const versions = CHANGELOG.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const r of CHANGELOG) expect(r.items.length).toBeGreaterThan(0);
  });
});
