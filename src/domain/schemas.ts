import { z } from "zod";
import {
  DEFAULT_GENERATION_STYLES,
} from "./generator";
import { normalizeBaseName, normalizeExtension } from "./normalize";
import type { GenerationStyle } from "./types";

export const providerModeSchema = z.enum(["mock", "hybrid", "live"]);

export const checkRequestSchema = z
  .object({
    names: z.array(z.string().min(1)).min(1).max(500),
    extensions: z.array(z.string().min(1)).min(1).max(50),
    mode: providerModeSchema.default("mock"),
    includeSuggestions: z.boolean().default(true),
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
  .refine((value) => value.names.length * value.extensions.length <= 5000, {
    message:
      "Synchronous checks are capped at 5,000 combinations. Use the bulk queue in Phase 2 for larger runs.",
    path: ["names"],
  });

export const generationStyleSchema = z.enum(DEFAULT_GENERATION_STYLES as [
  GenerationStyle,
  ...GenerationStyle[],
]);

export const generateRequestSchema = z.object({
  seed: z.string().min(2).max(1_000),
  limit: z.number().int().min(5).max(200).default(80),
  styles: z.array(generationStyleSchema).default([...DEFAULT_GENERATION_STYLES]),
});
