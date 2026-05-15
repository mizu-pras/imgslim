import { existsSync } from "node:fs";
import { chmod, lstat, stat, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { join, extname, basename, dirname } from "node:path";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { walkMatchingFiles } from "./file-walker";

export const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);
const MINIFY_CANDIDATE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);
const SCALE_CANDIDATE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);

export type ScaleSpec =
  | { type: "percent"; value: number }
  | { type: "dimensions"; width?: number; height?: number };

export interface OptimizerOptions {
  outDir?: string;
  quality: number;
  lossless: boolean;
  recursive: boolean;
  overwrite: boolean;
  auto: boolean;
  concurrency: number;
  maxInputPixels: number;
  mode?: "convert" | "minify" | "scale";
  minifyDryRun?: boolean;
  minifySuffix?: string;
  minifyLosslessOnly?: boolean;
  scaleDryRun?: boolean;
  scaleSuffix?: string;
  scaleSize?: ScaleSpec;
  onProgress?: (file: string, current: number, total: number) => void;
}

export interface ConversionResult {
  input: string;
  output: string;
  inputSize: number;
  outputSize: number;
  quality?: number;
  durationMs: number;
  inputWidth?: number;
  inputHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
}

export interface SkippedResult {
  status: "skipped" | "would-convert";
  input: string;
  output?: string;
  reason: string;
}

export interface AutoSkipResult {
  path: string;
  reason: string;
}

export interface OptimizerStats {
  converted: ConversionResult[];
  skipped: SkippedResult[];
  autoSkipped: AutoSkipResult[];
  failed: { path: string; error: string }[];
  totalBytesSaved: number;
}

export function isImageFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function isMinifyCandidateFile(filePath: string): boolean {
  return MINIFY_CANDIDATE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function isScaleCandidateFile(filePath: string): boolean {
  return SCALE_CANDIDATE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function findImageFiles(
  inputPath: string,
  recursive: boolean,
  isSupportedFile: (filePath: string) => boolean = isImageFile
): string[] {
  return walkMatchingFiles(inputPath, {
    recursive,
    shouldIncludeFile: isSupportedFile,
  });
}

function createSharpInstance(inputPath: string, options: OptimizerOptions): sharp.Sharp {
  return sharp(inputPath, { limitInputPixels: options.maxInputPixels });
}

function resolveOutputPath(
  inputPath: string,
  outDir: string | undefined
): string {
  const inputBaseName = basename(inputPath);
  const webpName =
    inputBaseName.replace(/\.(png|jpe?g|svg)$/i, "") + ".webp";

  if (outDir) {
    return join(outDir, webpName);
  }

  return join(dirname(inputPath), webpName);
}

function tmpPathFor(outputPath: string): string {
  return `${outputPath}.${randomBytes(4).toString("hex")}.tmp`;
}

async function atomicWriteFile(outputPath: string, data: Buffer): Promise<void> {
  const tmp = tmpPathFor(outputPath);
  await writeFile(tmp, data);
  await rename(tmp, outputPath);
}

async function atomicSharpToFile(
  inputPath: string,
  options: OptimizerOptions,
  webpOptions: sharp.WebpOptions,
  outputPath: string
): Promise<void> {
  const tmp = tmpPathFor(outputPath);
  await createSharpInstance(inputPath, options).webp(webpOptions).toFile(tmp);
  await rename(tmp, outputPath);
}

function emptyStats(): OptimizerStats {
  return {
    converted: [],
    skipped: [],
    autoSkipped: [],
    failed: [],
    totalBytesSaved: 0,
  };
}

function mergeStats(target: OptimizerStats, source: OptimizerStats): void {
  target.converted.push(...source.converted);
  target.skipped.push(...source.skipped);
  target.autoSkipped.push(...source.autoSkipped);
  target.failed.push(...source.failed);
  target.totalBytesSaved += source.totalBytesSaved;
}

function createSkip(input: string, reason: string, output?: string, status: SkippedResult["status"] = "skipped"): SkippedResult {
  return { status, input, output, reason };
}

async function analyzeAndConvert(
  inputPath: string,
  options: OptimizerOptions,
  outputPath: string,
  inputSize: number,
  startedAt: number
): Promise<OptimizerStats> {
  const stats = emptyStats();
  // Lossless mode: analyze once and skip if not smaller
  if (options.lossless) {
    const buf = await createSharpInstance(inputPath, options).webp({ lossless: true }).toBuffer();
    if (buf.length >= inputSize) {
      stats.autoSkipped.push({
        path: inputPath,
        reason: `lossless WebP not smaller than original (${buf.length} >= ${inputSize} bytes)`,
      });
      return stats;
    }
    await atomicWriteFile(outputPath, buf);
    stats.converted.push({
      input: inputPath,
      output: outputPath,
      inputSize,
      outputSize: buf.length,
      durationMs: Math.round(performance.now() - startedAt),
    });
    stats.totalBytesSaved += inputSize - buf.length;
    return stats;
  }

  // Lossy mode: test candidate qualities [90, 80, 70, 60] sequentially
  const qualities = [90, 80, 70, 60];
  let bestCandidate: { quality: number; buffer: Buffer; size: number } | null = null;

  for (const q of qualities) {
    try {
      const buf = await createSharpInstance(inputPath, options).webp({ quality: q }).toBuffer();
      const candidate = { quality: q, buffer: buf, size: buf.length };
      if (candidate.size <= inputSize * 0.9) {
        await atomicWriteFile(outputPath, candidate.buffer);
        stats.converted.push({
          input: inputPath,
          output: outputPath,
          inputSize,
          outputSize: candidate.size,
          quality: candidate.quality,
          durationMs: Math.round(performance.now() - startedAt),
        });
        stats.totalBytesSaved += inputSize - candidate.size;
        return stats;
      }
      if (candidate.size < inputSize && (!bestCandidate || candidate.size < bestCandidate.size)) {
        bestCandidate = candidate;
      }
    } catch {
      // individual quality failure shouldn't abort the rest
    }
  }

  if (bestCandidate) {
    await atomicWriteFile(outputPath, bestCandidate.buffer);
    stats.converted.push({
      input: inputPath,
      output: outputPath,
      inputSize,
      outputSize: bestCandidate.size,
      quality: bestCandidate.quality,
      durationMs: Math.round(performance.now() - startedAt),
    });
    stats.totalBytesSaved += inputSize - bestCandidate.size;
  } else {
    stats.autoSkipped.push({
      path: inputPath,
      reason: `no WebP candidate smaller than original (${inputSize} bytes)`,
    });
  }

  return stats;
}

async function convertFile(
  inputPath: string,
  options: OptimizerOptions
): Promise<OptimizerStats> {
  const stats = emptyStats();
  const startedAt = performance.now();
  const outputPath = resolveOutputPath(inputPath, options.outDir);

  // Check if output already exists
  if (existsSync(outputPath) && !options.overwrite) {
    stats.skipped.push(createSkip(inputPath, "output exists, use --overwrite to replace", outputPath));
    return stats;
  }

  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  try {
    const inputStat = await stat(inputPath);
    const inputSize = inputStat.size;

    // Auto mode: analyze candidates and pick the best one
    if (options.auto) {
      return analyzeAndConvert(inputPath, options, outputPath, inputSize, startedAt);
    }

    // Default mode: single pass with specified quality
    await atomicSharpToFile(
      inputPath,
      options,
      { quality: options.quality, lossless: options.lossless },
      outputPath
    );

    const outputStat = await stat(outputPath);
    const outputSize = outputStat.size;

    stats.converted.push({
      input: inputPath,
      output: outputPath,
      inputSize,
      outputSize,
      durationMs: Math.round(performance.now() - startedAt),
    });
    const bytesSaved = inputSize - outputSize;
    if (bytesSaved > 0) {
      stats.totalBytesSaved += bytesSaved;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stats.failed.push({ path: inputPath, error: message });
  }

  return stats;
}

function suffixedOutputPath(inputPath: string, suffix: string, outDir?: string): string {
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);
  const outputName = `${base}${suffix}${ext}`;
  if (outDir) {
    return join(outDir, outputName);
  }
  return join(dirname(inputPath), outputName);
}

function minifyOutputPath(inputPath: string, suffix: string, outDir?: string): string {
  return suffixedOutputPath(inputPath, suffix, outDir);
}

function scaleOutputPath(inputPath: string, suffix: string, outDir?: string): string {
  return suffixedOutputPath(inputPath, suffix, outDir);
}

async function minifyFile(
  inputPath: string,
  options: OptimizerOptions
): Promise<OptimizerStats> {
  const stats = emptyStats();
  const startedAt = performance.now();
  const ext = extname(inputPath).toLowerCase();
  const suffix = options.minifySuffix ?? "_min";
  let tmp: string | undefined;

  // MVP: PNG only
  if (ext !== ".png") {
    stats.skipped.push(createSkip(inputPath, "unsupported format for minify, only PNG supported"));
    return stats;
  }

  // Skip files whose basename already ends with active suffix
  const base = basename(inputPath, ext);
  if (base.endsWith(suffix)) {
    stats.skipped.push(createSkip(inputPath, `already has suffix "${suffix}", skipping`));
    return stats;
  }

  const outputPath = minifyOutputPath(inputPath, suffix, options.outDir);

  // Lightweight symlink check (runs even in dry-run)
  let isSymlink = false;
  try {
    const linkStat = existsSync(inputPath) ? await lstat(inputPath) : null;
    isSymlink = linkStat !== null && linkStat.isSymbolicLink();
  } catch {
    // ignore lstat errors
  }
  if (isSymlink) {
    stats.skipped.push(createSkip(inputPath, "symlink skipped for safe minify", outputPath));
    return stats;
  }

  // Check if output already exists
  if (existsSync(outputPath) && !options.overwrite) {
    const msg = "output exists, use --overwrite to replace";
    if (options.minifyDryRun) {
      stats.skipped.push(createSkip(inputPath, msg, outputPath));
    } else {
      stats.skipped.push(createSkip(inputPath, msg, outputPath));
    }
    return stats;
  }

  // Dry-run: report would-convert without processing
  if (options.minifyDryRun) {
    stats.skipped.push(createSkip(inputPath, "would convert in dry-run", outputPath, "would-convert"));
    return stats;
  }

  try {
    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const inputStat = await stat(inputPath);
    const inputSize = inputStat.size;

    const metadata = await createSharpInstance(inputPath, options).metadata();
    if ((metadata.pages ?? 1) > 1) {
      stats.skipped.push(createSkip(inputPath, "animated PNG skipped for safe minify", outputPath));
      return stats;
    }

    tmp = tmpPathFor(outputPath);

    const pngOpts: sharp.PngOptions = options.minifyLosslessOnly
      ? { compressionLevel: 9, effort: 10 }
      : { compressionLevel: 9, palette: true, effort: 10 };

    await createSharpInstance(inputPath, options).png(pngOpts).toFile(tmp);

    const tmpStat = await stat(tmp);
    const outputSize = tmpStat.size;

    if (outputSize < inputSize) {
      await chmod(tmp, inputStat.mode);
      await rename(tmp, outputPath);
      tmp = undefined;
      stats.converted.push({
        input: inputPath,
        output: outputPath,
        inputSize,
        outputSize,
        durationMs: Math.round(performance.now() - startedAt),
      });
      stats.totalBytesSaved += inputSize - outputSize;
    } else {
      await unlink(tmp);
      tmp = undefined;
      stats.autoSkipped.push({
        path: inputPath,
        reason: `minified not smaller than original (${outputSize} >= ${inputSize} bytes)`,
      });
    }
  } catch (err: unknown) {
    if (tmp) {
      try {
        await unlink(tmp);
      } catch {
        // best-effort cleanup
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    stats.failed.push({ path: inputPath, error: message });
  }

  return stats;
}

function calculateScaleDimensions(
  metadata: sharp.Metadata,
  spec: ScaleSpec
): { width: number; height: number } | null {
  const inputWidth = metadata.width;
  const inputHeight = metadata.height;
  if (!inputWidth || !inputHeight) {
    return null;
  }

  if (spec.type === "percent") {
    const ratio = spec.value / 100;
    const width = Math.max(1, Math.round(inputWidth * ratio));
    const height = Math.max(1, Math.round(inputHeight * ratio));
    if (width >= inputWidth && height >= inputHeight) {
      return null;
    }
    return { width, height };
  }

  if (spec.width && spec.height) {
    const ratio = Math.min(spec.width / inputWidth, spec.height / inputHeight, 1);
    const width = Math.max(1, Math.round(inputWidth * ratio));
    const height = Math.max(1, Math.round(inputHeight * ratio));
    if (width >= inputWidth && height >= inputHeight) {
      return null;
    }
    return { width, height };
  }

  if (spec.width) {
    if (spec.width >= inputWidth) {
      return null;
    }
    return {
      width: spec.width,
      height: Math.max(1, Math.round(inputHeight * (spec.width / inputWidth))),
    };
  }

  if (spec.height) {
    if (spec.height >= inputHeight) {
      return null;
    }
    return {
      width: Math.max(1, Math.round(inputWidth * (spec.height / inputHeight))),
      height: spec.height,
    };
  }

  return null;
}

async function scaleFile(
  inputPath: string,
  options: OptimizerOptions
): Promise<OptimizerStats> {
  const stats = emptyStats();
  const startedAt = performance.now();
  const ext = extname(inputPath).toLowerCase();
  const suffix = options.scaleSuffix ?? "_scaled";
  let tmp: string | undefined;

  if (ext === ".svg") {
    stats.skipped.push(createSkip(inputPath, "unsupported format for scale, SVG is skipped"));
    return stats;
  }

  const spec = options.scaleSize;
  if (!spec) {
    stats.failed.push({ path: inputPath, error: "missing scale size" });
    return stats;
  }

  const outputPath = scaleOutputPath(inputPath, suffix, options.outDir);

  if (existsSync(outputPath) && !options.overwrite) {
    stats.skipped.push(createSkip(inputPath, "output exists, use --overwrite to replace", outputPath));
    return stats;
  }

  try {
    const metadata = await createSharpInstance(inputPath, options).metadata();
    const dimensions = calculateScaleDimensions(metadata, spec);
    if (!dimensions || !metadata.width || !metadata.height) {
      stats.skipped.push(createSkip(inputPath, "target size would not reduce image dimensions", outputPath));
      return stats;
    }

    if (options.scaleDryRun) {
      stats.skipped.push(createSkip(inputPath, "would scale in dry-run", outputPath, "would-convert"));
      return stats;
    }

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const inputStat = await stat(inputPath);
    const inputSize = inputStat.size;

    tmp = tmpPathFor(outputPath);
    await createSharpInstance(inputPath, options)
      .resize({
        width: dimensions.width,
        height: dimensions.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFile(tmp);

    const outputStat = await stat(tmp);
    await chmod(tmp, inputStat.mode);
    await rename(tmp, outputPath);
    tmp = undefined;

    stats.converted.push({
      input: inputPath,
      output: outputPath,
      inputSize,
      outputSize: outputStat.size,
      durationMs: Math.round(performance.now() - startedAt),
      inputWidth: metadata.width,
      inputHeight: metadata.height,
      outputWidth: dimensions.width,
      outputHeight: dimensions.height,
    });
    const bytesSaved = inputSize - outputStat.size;
    if (bytesSaved > 0) {
      stats.totalBytesSaved += bytesSaved;
    }
  } catch (err: unknown) {
    if (tmp) {
      try {
        await unlink(tmp);
      } catch {
        // best-effort cleanup
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    stats.failed.push({ path: inputPath, error: message });
  }

  return stats;
}

async function processPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let i = 0;
  const next = async (): Promise<void> => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  };
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => next()));
}

export async function optimize(
  inputs: string[],
  options: OptimizerOptions
): Promise<OptimizerStats> {
  const stats = emptyStats();

  // Collect all image files
  const files: string[] = [];
  const isMinify = options.mode === "minify";
  const isScale = options.mode === "scale";
  const isSupportedFile = isMinify
    ? isMinifyCandidateFile
    : isScale
      ? isScaleCandidateFile
      : isImageFile;
  for (const input of inputs) {
    try {
      const found = findImageFiles(input, options.recursive, isSupportedFile);
      files.push(...found);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      stats.failed.push({ path: input, error: message });
    }
  }

  // For suffixed modes: dedupe + skip files whose basename already ends with active suffix
  // (avoids double-suffix on repeated runs) + detect output path collisions
  let filesToProcess: string[];
  if (isMinify || isScale) {
    const suffix = isMinify ? options.minifySuffix ?? "_min" : options.scaleSuffix ?? "_scaled";
    const outputPathFor = isMinify ? minifyOutputPath : scaleOutputPath;
    const unique = Array.from(new Set(files));
    const filtered = unique.filter((f) => {
      const ext = extname(f);
      const base = basename(f, ext);
      if (base.endsWith(suffix)) {
        stats.skipped.push(createSkip(f, `already has suffix "${suffix}", skipping`));
        return false;
      }
      return true;
    });
    const seenOutputs = new Set<string>();
    filesToProcess = filtered.filter((f) => {
      const outPath = outputPathFor(f, suffix, options.outDir);
      if (seenOutputs.has(outPath)) {
        stats.skipped.push(createSkip(f, `output collision with earlier input (${outPath})`, outPath));
        return false;
      }
      seenOutputs.add(outPath);
      return true;
    });
  } else {
    const seenOutputs = new Set<string>();
    filesToProcess = files.filter((file) => {
      const outPath = resolveOutputPath(file, options.outDir);
      if (seenOutputs.has(outPath)) {
        stats.skipped.push(createSkip(file, `output collision with earlier input (${outPath})`, outPath));
        return false;
      }
      seenOutputs.add(outPath);
      return true;
    });
  }

  // Convert/minify files with deterministic aggregation order
  let completed = 0;
  const total = filesToProcess.length;
  const resultsByIndex = new Array<OptimizerStats>(total);
  await processPool(filesToProcess, options.concurrency, async (file, index) => {
    const current = ++completed;
    options.onProgress?.(file, current, total);
    if (isMinify) {
      resultsByIndex[index] = await minifyFile(file, options);
    } else if (isScale) {
      resultsByIndex[index] = await scaleFile(file, options);
    } else {
      resultsByIndex[index] = await convertFile(file, options);
    }
  });

  for (const fileStats of resultsByIndex) {
    if (fileStats) {
      mergeStats(stats, fileStats);
    }
  }

  // Clear progress line
  if (total > 0 && options.onProgress) {
    process.stderr.write("\r" + " ".repeat(80) + "\r");
  }

  return stats;
}
