import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTENSIONS,
  isKnownExtension,
  isRestrictedExtension,
  TLD_CATALOG,
  validateCatalogExtension,
} from "../tlds";

describe("TLD catalog", () => {
  it("loads default TLDs with catalog metadata", () => {
    expect(DEFAULT_EXTENSIONS).toContain("ai");
    expect(TLD_CATALOG.length).toBe(DEFAULT_EXTENSIONS.length);
    expect(TLD_CATALOG.find((item) => item.extension === "com.sg")).toMatchObject({
      extension: "com.sg",
      rootTld: "sg",
      singapore: true,
    });
  });

  it("marks restricted TLDs", () => {
    expect(isRestrictedExtension("edu")).toBe(true);
    expect(TLD_CATALOG.find((item) => item.extension === "edu")?.restricted).toBe(true);
  });

  it("validates supported catalog extensions", () => {
    for (const extension of ["ai", ".com", "sg", "com.sg", "education", "edu"]) {
      expect(isKnownExtension(extension)).toBe(true);
      expect(validateCatalogExtension(extension)).toMatchObject({
        normalized: extension.replace(/^\./, ""),
        valid: true,
      });
    }
  });

  it("rejects unknown extensions unless custom mode is enabled", () => {
    expect(validateCatalogExtension("notreal")).toMatchObject({
      normalized: "notreal",
      valid: false,
    });
    expect(validateCatalogExtension("notreal", { allowCustom: true })).toMatchObject({
      normalized: "notreal",
      valid: true,
    });
  });
});
