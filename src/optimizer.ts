import { readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { stat, mkdir, writeFile } from "node:fs/promises";
import { join, extname, basename, dirname, relative } from "node:path";
import sharp from "sharp";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);

export interface OptimizerOptions {
  outDir?: string;
  quality: number;
  lossless: boolean;
  recursive: boolean;
  overwrite: boolean;
  auto: boolean;
}

export interface ConversionResult {
  input: string;
  output: string;
  inputSize: number;
  outputSize: number;
  quality?: number;
}

export interface AutoSkipResult {
  path: string;
  reason: string;
}

export interface OptimizerStats {
  converted: ConversionResult[];
  skipped: string[];
  autoSkipped: AutoSkipResult[];
  failed: { path: string; error: string }[];
  totalBytesSaved: number;
}

function isImageFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function findImageFiles(
  inputPath: string,
  recursive: boolean
): string[] {
  const results: string[] = [];

  try {
    const stats = statSync(inputPath);

    if (stats.isFile()) {
      if (isImageFile(inputPath)) {
        results.push(inputPath);
      }
    } else if (stats.isDirectory()) {
      const entries = readdirSync(inputPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(inputPath, entry.name);
        if (entry.isFile() && isImageFile(fullPath)) {
          results.push(fullPath);
        } else if (entry.isDirectory() && recursive) {
          results.push(...findImageFiles(fullPath, recursive));
        }
      }
    }
  } catch (err: unknown) {
    // path doesn't exist or is inaccessible — will be reported as failed
    throw err;
  }

  return results;
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

async function analyzeAndConvert(
  inputPath: string,
  options: OptimizerOptions,
  outputPath: string,
  inputSize: number,
  stats: OptimizerStats
): Promise<void> {
  // Lossless mode: analyze once and skip if not smaller
  if (options.lossless) {
    const buf = await sharp(inputPath).webp({ lossless: true }).toBuffer();
    if (buf.length >= inputSize) {
      stats.autoSkipped.push({
        path: inputPath,
        reason: `lossless WebP not smaller than original (${buf.length} >= ${inputSize} bytes)`,
      });
      return;
    }
    await writeFile(outputPath, buf);
    stats.converted.push({
      input: inputPath,
      output: outputPath,
      inputSize,
      outputSize: buf.length,
    });
    stats.totalBytesSaved += inputSize - buf.length;
    return;
  }

  // Lossy mode: test candidate qualities [90, 80, 70, 60]
  const qualities = [90, 80, 70, 60];
  const candidates: { quality: number; buffer: Buffer; size: number }[] = [];

  for (const q of qualities) {
    const buf = await sharp(inputPath).webp({ quality: q }).toBuffer();
    candidates.push({ quality: q, buffer: buf, size: buf.length });
  }

  // Select highest quality with at least 10% size reduction
  for (const c of candidates) {
    if (c.size <= inputSize * 0.9) {
      await writeFile(outputPath, c.buffer);
      stats.converted.push({
        input: inputPath,
        output: outputPath,
        inputSize,
        outputSize: c.size,
        quality: c.quality,
      });
      stats.totalBytesSaved += inputSize - c.size;
      return;
    }
  }

  // None meet 10% — pick the smallest candidate that is still smaller than original
  let bestCandidate: (typeof candidates)[0] | null = null;
  for (const c of candidates) {
    if (c.size < inputSize && (!bestCandidate || c.size < bestCandidate.size)) {
      bestCandidate = c;
    }
  }

  if (bestCandidate) {
    await writeFile(outputPath, bestCandidate.buffer);
    stats.converted.push({
      input: inputPath,
      output: outputPath,
      inputSize,
      outputSize: bestCandidate.size,
      quality: bestCandidate.quality,
    });
    stats.totalBytesSaved += inputSize - bestCandidate.size;
  } else {
    stats.autoSkipped.push({
      path: inputPath,
      reason: `no WebP candidate smaller than original (${inputSize} bytes)`,
    });
  }
}

async function convertFile(
  inputPath: string,
  options: OptimizerOptions,
  stats: OptimizerStats
): Promise<void> {
  const outputPath = resolveOutputPath(inputPath, options.outDir);

  // Check if output already exists
  if (existsSync(outputPath) && !options.overwrite) {
    stats.skipped.push(
      `${inputPath} (output exists, use --overwrite to replace)`
    );
    return;
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
      await analyzeAndConvert(inputPath, options, outputPath, inputSize, stats);
      return;
    }

    // Default mode: single pass with specified quality
    await sharp(inputPath)
      .webp({ quality: options.quality, lossless: options.lossless })
      .toFile(outputPath);

    const outputStat = await stat(outputPath);
    const outputSize = outputStat.size;

    stats.converted.push({
      input: inputPath,
      output: outputPath,
      inputSize,
      outputSize,
    });
    stats.totalBytesSaved += inputSize - outputSize;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stats.failed.push({ path: inputPath, error: message });
  }
}

export async function optimize(
  inputs: string[],
  options: OptimizerOptions
): Promise<OptimizerStats> {
  const stats: OptimizerStats = {
    converted: [],
    skipped: [],
    autoSkipped: [],
    failed: [],
    totalBytesSaved: 0,
  };

  // Collect all image files
  const files: string[] = [];
  for (const input of inputs) {
    try {
      const found = findImageFiles(input, options.recursive);
      files.push(...found);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      stats.failed.push({ path: input, error: message });
    }
  }

  // Convert each file
  for (const file of files) {
    await convertFile(file, options, stats);
  }

  return stats;
}
