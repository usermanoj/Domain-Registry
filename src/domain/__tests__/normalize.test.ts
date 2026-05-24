import { describe, expect, it } from "vitest";
import {
  buildDomainInputs,
  normalizeBaseName,
  normalizeExtension,
  parseDomainName,
  splitNames,
} from "../normalize";

describe("domain normalization", () => {
  it("parses standard and multi-label domains into SLD/TLD parts", () => {
    expect(parseDomainName("aptava.ai")).toMatchObject({
      domain: "aptava.ai",
      sld: "aptava",
      tld: "ai",
      valid: true,
    });
    expect(parseDomainName("mybrand.com.sg")).toMatchObject({
      domain: "mybrand.com.sg",
      sld: "mybrand",
      tld: "com.sg",
      valid: true,
    });
  });

  it("rejects invalid characters and empty names", () => {
    expect(parseDomainName("bad_name.ai").valid).toBe(false);
    expect(parseDomainName("").valid).toBe(false);
    expect(parseDomainName("   ").valid).toBe(false);
  });

  it("normalizes uppercase, whitespace, and pasted URLs", () => {
    expect(parseDomainName("  HTTPS://WWW.APTAVA.AI/path?q=1  ")).toMatchObject({
      domain: "aptava.ai",
      sld: "aptava",
      tld: "ai",
      valid: true,
    });
  });

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
