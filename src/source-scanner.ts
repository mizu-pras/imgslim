import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

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
  const stats = statSync(inputPath);

  if (stats.isFile()) {
    return isSourceFile(inputPath, extensions) ? [inputPath] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const files: string[] = [];
  const entries = readdirSync(inputPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = join(inputPath, entry.name);
    if (entry.isFile() && isSourceFile(fullPath, extensions)) {
      files.push(fullPath);
    } else if (entry.isDirectory() && options.recursive) {
      files.push(...collectSourceFiles(fullPath, options, extensions));
    }
  }

  return files;
}

function isExternalReference(reference: string): boolean {
  return /^(?:https?:)?\/\//i.test(reference) || /^(?:data|blob):/i.test(reference);
}

function cleanReference(reference: string): string {
  return reference
    .trim()
    .replace(/^url\(\s*/i, "")
    .replace(/^['"`]+|['"`)]+$/g, "");
}

function resolveReference(sourceFile: string, reference: string): string {
  const cleaned = cleanReference(reference);

  if (isAbsolute(cleaned)) {
    const fromCwd = resolve(process.cwd(), `.${cleaned}`);
    if (existsSync(fromCwd)) return fromCwd;
    return cleaned;
  }

  return resolve(dirname(sourceFile), cleaned);
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

  for (const sourceFile of sourceFiles) {
    try {
      const content = await readFile(sourceFile, "utf8");
      for (const match of content.matchAll(IMAGE_REFERENCE_RE)) {
        const reference = match[1] ?? match[2];
        if (!reference || isExternalReference(reference)) continue;

        const imagePath = resolveReference(sourceFile, reference);
        if (existsSync(imagePath) && statSync(imagePath).isFile()) {
          images.add(imagePath);
        } else {
          result.unresolved.push({ source: sourceFile, reference });
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
