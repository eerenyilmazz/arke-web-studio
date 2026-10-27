import { copyFileSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FactoryError } from "../core/errors.js";

export const ASSET_KINDS = ["logo", "gallery", "hero", "team", "og"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

type ImageType = "png" | "jpg" | "webp" | "avif" | "svg";

/** Detects the real file type from its bytes; the extension the client used is ignored. */
export function sniffImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp" && /^avi[fs]$/.test(bytes.toString("ascii", 8, 12))) return "avif";
  const head = bytes.toString("utf8", 0, Math.min(bytes.length, 512)).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return "svg";
  return null;
}

/**
 * SVGs are code. Rather than trying to clean them, anything that can run script,
 * load external resources or abuse the XML parser is rejected outright.
 */
const SVG_FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/<script[\s>]/i, "<script> element"],
  [/\son[a-z]+\s*=/i, "event-handler attribute (onload, onclick, …)"],
  [/javascript:/i, "javascript: URL"],
  [/<foreignObject[\s>]/i, "<foreignObject> element"],
  [/<!ENTITY/i, "XML entity declaration"],
  [/<!DOCTYPE/i, "DOCTYPE declaration"],
  [/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|webp);)/i, "external reference (href to another file or URL)"],
  [/@import|url\(\s*["']?\s*(?:https?:|\/\/)/i, "external stylesheet or URL in CSS"],
  [/<(?:iframe|embed|object|use)[\s>][^>]*(?:src|href)\s*=\s*["']\s*(?:https?:|\/\/)/i, "embedded external content"],
];

export function checkSvg(text: string): string[] {
  return SVG_FORBIDDEN.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

export interface SavedAsset {
  readonly relPath: string;
  readonly type: ImageType;
  readonly bytes: number;
}

/**
 * Copies one file from the inbox into the client's assets folder after checking
 * size, real type and (for SVG) content. The caller has already confined both paths.
 */
export function saveAsset(params: { sourceAbs: string; assetsDir: string; kind: AssetKind; name: string; maxBytes: number }): SavedAsset {
  const stat = lstatSync(params.sourceAbs, { throwIfNoEntry: false });
  if (!stat) throw new FactoryError("Source file not found in the inbox.", "Put the file in the inbox folder first.");
  if (stat.isSymbolicLink() || !stat.isFile()) throw new FactoryError("Source must be a regular file (no links or folders).");
  if (stat.size > params.maxBytes) {
    throw new FactoryError(
      `File is ${(stat.size / 1048576).toFixed(1)} MB; limit is ${(params.maxBytes / 1048576).toFixed(1)} MB.`,
      "Ask the client for a smaller export.",
    );
  }

  const bytes = readFileSync(params.sourceAbs);
  const type = sniffImageType(bytes);
  if (!type) throw new FactoryError("Not a supported image (PNG, JPG, WebP, AVIF or SVG).", "The file content was checked, not just its extension.");
  if (type === "svg") {
    const problems = checkSvg(bytes.toString("utf8"));
    if (problems.length > 0) {
      throw new FactoryError(`SVG rejected: contains ${problems.join(", ")}.`, "Ask for a plain SVG export or a PNG instead.");
    }
  }

  const base = params.name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const fileName = `${params.kind}-${base || "image"}.${type}`;
  mkdirSync(params.assetsDir, { recursive: true });
  copyFileSync(params.sourceAbs, path.join(params.assetsDir, fileName));
  return { relPath: `assets/${fileName}`, type, bytes: stat.size };
}
