import { describe, expect, it } from "vitest";
import { prehash } from "./account";

describe("senha", () => {
  it("só a chave derivada sai do aparelho (fixa por senha, 256 bits)", async () => {
    const a = await prehash("senha-forte-1");
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(a).not.toContain("senha");
    expect(await prehash("senha-forte-1")).toBe(a);
    expect(await prehash("senha-forte-2")).not.toBe(a);
  });
});
