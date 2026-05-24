import { describe, expect, it } from "vitest";
import {
  buildDomainInputs,
  normalizeBaseName,
  normalizeExtension,
  splitNames,
} from "../normalize";

describe("domain normalization", () => {
  it("normalizes names without treating full domains as separate names", () => {
    expect(normalizeBaseName("https://www.Aptava.ai/path")).toBe("aptava");
    expect(normalizeBaseName("Trust & Action")).toBe("trust-and-action");
  });

  it("normalizes multi-label extensions", () => {
    expect(normalizeExtension(".COM.SG")).toBe("com.sg");
  });

  it("builds unique domain inputs", () => {
    const inputs = buildDomainInputs(["Aptava", "aptava"], [".ai", "ai", "com.sg"]);

    expect(inputs.map((input) => input.domain)).toEqual([
      "aptava.ai",
      "aptava.com.sg",
    ]);
  });

  it("splits pasted bulk names", () => {
    expect(splitNames("aptava\ntrust flow; data ops")).toEqual([
      "aptava",
      "trust-flow",
      "data-ops",
    ]);
  });
});
