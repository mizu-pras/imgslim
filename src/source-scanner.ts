import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { walkMatchingFiles } from "./file-walker";

const DEFAULT_SOURCE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".mdx",
]);

const IMAGE_REFERENCE_RE = /(?:url\(\s*['"]?([^'")\s]+\.(?:png|jpe?g|webp|avif|tiff?|svg))(?:[?#][^'")\s]*)?['"]?\s*\)|["'`]([^"'`]+\.(?:png|jpe?g|webp|avif|tiff?|svg))(?:[?#][^"'`]*)?["'`])/gi;
const MARKDOWN_REFERENCE_RE = /!?\[[^\]]*\]\(([^)]+)\)/gi;
const SRCSET_REFERENCE_RE = /\b(?:srcset|imagesrcset)\s*=\s*(["'`])([\s\S]*?)\1/gi;

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
]);

export interface ScanOptions {
  recursive: boolean;
  sourceExtensions?: string[];
  assetRoot?: string;
  aliases?: Record<string, string>;
  onProgress?: (file: string, current: number, total: number) => void;
}

export interface SourceScanResult {
  sourceFiles: number;
  images: string[];
  unresolved: { source: string; reference: string }[];
  failed: { path: string; error: string }[];
}

function normalizeExtension(extension: string): string {
  return extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
}

function sourceExtensions(options: ScanOptions): Set<string> {
  if (!options.sourceExtensions || options.sourceExtensions.length === 0) {
    return DEFAULT_SOURCE_EXTENSIONS;
  }

  return new Set(options.sourceExtensions.map(normalizeExtension));
}

function isSourceFile(filePath: string, extensions: Set<string>): boolean {
  return extensions.has(extname(filePath).toLowerCase());
}

function collectSourceFiles(inputPath: string, options: ScanOptions, extensions: Set<string>): string[] {
  return walkMatchingFiles(inputPath, {
    recursive: options.recursive,
    ignoredDirs: IGNORED_DIRS,
    shouldIncludeFile: (filePath) => isSourceFile(filePath, extensions),
  });
}

function isExternalReference(reference: string): boolean {
  return /^(?:https?:)?\/\//i.test(reference) || /^(?:data|blob):/i.test(reference);
}

function cleanReference(reference: string): string {
  return reference
    .trim()
    .replace(/^url\(\s*/i, "")
    .replace(/^['"`]+|['"`)]+$/g, "")
    .replace(/^<|>$/g, "");
}

function stripReferenceModifiers(reference: string): string {
  return reference.replace(/[?#].*$/, "");
}

function cleanMarkdownReference(reference: string): string {
  return cleanReference(reference).split(/\s+/)[0] ?? "";
}

function extractSrcsetReferences(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/\s+/)[0])
    .filter(Boolean);
}

function resolveAliasReference(reference: string, aliases: Record<string, string> | undefined): string | null {
  if (!aliases) return null;

  const matches = Object.entries(aliases)
    .filter(([prefix]) => reference.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);

  const match = matches[0];
  if (!match) return null;

  const [prefix, targetDir] = match;
  return resolve(process.cwd(), targetDir, reference.slice(prefix.length).replace(/^\/+/, ""));
}

function resolveReference(sourceFile: string, reference: string, options: ScanOptions): string {
  const cleaned = stripReferenceModifiers(cleanReference(reference));
  const aliasResolved = resolveAliasReference(cleaned, options.aliases);
  if (aliasResolved) {
    return aliasResolved;
  }

  if (cleaned.startsWith("@/")) {
    const assetRoot = options.assetRoot ? resolve(process.cwd(), options.assetRoot) : process.cwd();
    return resolve(assetRoot, cleaned.slice(2));
  }

  if (isAbsolute(cleaned)) {
    const root = options.assetRoot ? resolve(process.cwd(), options.assetRoot) : process.cwd();
    const fromCwd = resolve(root, `.${cleaned}`);
    if (existsSync(fromCwd)) return fromCwd;
    return cleaned;
  }

  return resolve(dirname(sourceFile), cleaned);
}

function recordReference(
  sourceFile: string,
  reference: string | undefined,
  options: ScanOptions,
  images: Set<string>,
  unresolved: SourceScanResult["unresolved"],
  markdown = false
): void {
  if (!reference) return;

  const cleaned = markdown ? cleanMarkdownReference(reference) : cleanReference(reference);
  if (!cleaned || isExternalReference(cleaned)) return;

  const imagePath = resolveReference(sourceFile, cleaned, options);
  if (existsSync(imagePath) && statSync(imagePath).isFile()) {
    images.add(imagePath);
  } else {
    unresolved.push({ source: sourceFile, reference: cleaned });
  }
}

export async function scanSourceCodeForImages(
  inputs: string[],
  options: ScanOptions
): Promise<SourceScanResult> {
  const extensions = sourceExtensions(options);
  const result: SourceScanResult = {
    sourceFiles: 0,
    images: [],
    unresolved: [],
    failed: [],
  };

  const sourceFiles = new Set<string>();
  for (const input of inputs) {
    try {
      for (const sourceFile of collectSourceFiles(input, options, extensions)) {
        sourceFiles.add(sourceFile);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ path: input, error: message });
    }
  }

  result.sourceFiles = sourceFiles.size;
  const images = new Set<string>();

  let scanned = 0;
  for (const sourceFile of sourceFiles) {
    scanned++;
    options.onProgress?.(sourceFile, scanned, sourceFiles.size);
    try {
      const content = await readFile(sourceFile, "utf8");
      for (const match of content.matchAll(IMAGE_REFERENCE_RE)) {
        recordReference(sourceFile, match[1] ?? match[2], options, images, result.unresolved);
      }

      for (const match of content.matchAll(MARKDOWN_REFERENCE_RE)) {
        recordReference(sourceFile, match[1], options, images, result.unresolved, true);
      }

      for (const match of content.matchAll(SRCSET_REFERENCE_RE)) {
        for (const reference of extractSrcsetReferences(match[2])) {
          if (!reference || isExternalReference(reference)) continue;

          const imagePath = resolveReference(sourceFile, reference, options);
          if (existsSync(imagePath) && statSync(imagePath).isFile()) {
            images.add(imagePath);
          } else {
            result.unresolved.push({ source: sourceFile, reference });
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ path: sourceFile, error: message });
    }
  }

  result.images = [...images].sort();
  return result;
}
