import { z } from "zod";
import {
  ALL_GENERATION_STYLES,
  DEFAULT_GENERATION_STYLES,
  normalizeGenerationStyle,
} from "./generator";
import { normalizeBaseName, normalizeExtension } from "./normalize";
import { DEFAULT_EXTENSIONS, validateCatalogExtension } from "./tlds";
import type { GenerationStyle } from "./types";

export const providerModeSchema = z.enum(["mock", "hybrid", "live"]);

export const checkRequestSchema = z
  .object({
    names: z.array(z.string().min(1)).min(1).max(1_000),
    extensions: z.array(z.string().min(1)).min(1).max(50),
    mode: providerModeSchema.default("mock"),
    includeSuggestions: z.boolean().default(true),
    allowCustomExtensions: z.boolean().default(false),
  })
  .transform((value) => ({
    ...value,
    names: Array.from(new Set(value.names.map(normalizeBaseName).filter(Boolean))),
    extensions: Array.from(
      new Set(value.extensions.map(normalizeExtension).filter(Boolean)),
    ),
  }))
  .refine((value) => value.names.length > 0, {
    message: "At least one valid domain name is required.",
    path: ["names"],
  })
  .refine((value) => value.extensions.length > 0, {
    message: "At least one valid extension is required.",
    path: ["extensions"],
  })
  .refine(
    (value) =>
      value.extensions.every(
        (extension) =>
          validateCatalogExtension(extension, {
            allowCustom: value.allowCustomExtensions,
          }).valid,
      ),
    {
      message:
        "One or more extensions are not in the local catalog. Enable custom extensions to proceed.",
      path: ["extensions"],
    },
  )
  .refine((value) => value.names.length * value.extensions.length <= 5000, {
    message:
      "Synchronous checks are capped at 5,000 combinations. Use the bulk queue in Phase 2 for larger runs.",
    path: ["names"],
  });

export const generationStyleSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? normalizeGenerationStyle(value) ?? value
      : value,
  z.enum(ALL_GENERATION_STYLES as [GenerationStyle, ...GenerationStyle[]]),
);

const styleListSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value.split(/[,;\n]+/).map((style) => style.trim()).filter(Boolean);
    }

    return value;
  },
  z.array(generationStyleSchema).min(1).max(16),
);

const textFilterSchema = z.string().max(80).optional().default("");

export const generateRequestSchema = z
  .object({
    seed: z.string().min(2).max(1_000),
    limit: z.coerce.number().int().min(1).max(300).optional(),
    numberOfCandidates: z.coerce.number().int().min(1).max(300).optional(),
    candidateCount: z.coerce.number().int().min(1).max(300).optional(),
    styles: styleListSchema.optional(),
    preferredStyle: styleListSchema.optional(),
    preferredStyles: styleListSchema.optional(),
    minLength: z.coerce.number().int().min(3).max(20).default(4),
    maxLength: z.coerce.number().int().min(3).max(24).default(12),
    allowedLetters: textFilterSchema,
    avoidLetters: textFilterSchema,
    mustInclude: textFilterSchema,
    mustIncludeText: textFilterSchema,
    mustAvoid: textFilterSchema,
    mustAvoidText: textFilterSchema,
    allowNumbersHyphens: z.boolean().default(false),
    allowCustomExtensions: z.boolean().default(false),
    extensions: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .default([...DEFAULT_EXTENSIONS]),
    mode: providerModeSchema.default("mock"),
  })
  .transform((value) => {
    const minLength = Math.min(value.minLength, value.maxLength);
    const maxLength = Math.max(value.minLength, value.maxLength);
    const styles = value.styles ??
      value.preferredStyles ??
      value.preferredStyle ??
      DEFAULT_GENERATION_STYLES;

    return {
      seed: value.seed,
      limit: value.limit ?? value.numberOfCandidates ?? value.candidateCount ?? 80,
      styles: Array.from(new Set(styles)),
      minLength,
      maxLength,
      allowedLetters: value.allowedLetters,
      avoidLetters: value.avoidLetters,
      mustInclude: value.mustInclude || value.mustIncludeText,
      mustAvoid: value.mustAvoid || value.mustAvoidText,
      allowNumbersHyphens: value.allowNumbersHyphens,
      allowCustomExtensions: value.allowCustomExtensions,
      extensions: Array.from(
        new Set(value.extensions.map(normalizeExtension).filter(Boolean)),
      ),
      mode: value.mode,
    };
  })
  .refine((value) => value.extensions.length > 0, {
    message: "At least one valid extension is required.",
    path: ["extensions"],
  })
  .refine(
    (value) =>
      value.extensions.every(
        (extension) =>
          validateCatalogExtension(extension, {
            allowCustom: value.allowCustomExtensions,
          }).valid,
      ),
    {
      message:
        "One or more extensions are not in the local catalog. Enable custom extensions to proceed.",
      path: ["extensions"],
    },
  )
  .refine((value) => value.limit * value.extensions.length <= 5_000, {
    message: "Generated domain checks are capped at 5,000 combinations.",
    path: ["limit"],
  });
