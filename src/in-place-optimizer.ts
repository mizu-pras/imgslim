import { stat, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import sharp from "sharp";

export interface InPlaceOptimizerOptions {
  quality: number;
  dryRun: boolean;
}

export interface InPlaceOptimizedResult {
  input: string;
  inputSize: number;
  outputSize: number;
  dryRun: boolean;
}

export interface InPlaceSkipResult {
  path: string;
  reason: string;
}

export interface InPlaceOptimizerStats {
  optimized: InPlaceOptimizedResult[];
  skipped: InPlaceSkipResult[];
  failed: { path: string; error: string }[];
  totalBytesSaved: number;
}

async function optimizeBuffer(inputPath: string, quality: number): Promise<Buffer | null> {
  const image = sharp(inputPath, { animated: true });
  const ext = extname(inputPath).toLowerCase();

  if (ext === ".png") {
    return image.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true }).toBuffer();
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return image.jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
  }

  if (ext === ".webp") {
    return image.webp({ quality }).toBuffer();
  }

  if (ext === ".avif") {
    return image.avif({ quality }).toBuffer();
  }

  if (ext === ".tif" || ext === ".tiff") {
    return image.tiff({ quality }).toBuffer();
  }

  return null;
}

export async function optimizeImagesInPlace(
  images: string[],
  options: InPlaceOptimizerOptions
): Promise<InPlaceOptimizerStats> {
  const stats: InPlaceOptimizerStats = {
    optimized: [],
    skipped: [],
    failed: [],
    totalBytesSaved: 0,
  };

  for (const imagePath of images) {
    try {
      const inputSize = (await stat(imagePath)).size;
      const buffer = await optimizeBuffer(imagePath, options.quality);

      if (!buffer) {
        stats.skipped.push({ path: imagePath, reason: "format cannot be optimized in-place" });
        continue;
      }

      if (buffer.length >= inputSize) {
        stats.skipped.push({
          path: imagePath,
          reason: `already optimized (${buffer.length} >= ${inputSize} bytes)`,
        });
        continue;
      }

      if (!options.dryRun) {
        await writeFile(imagePath, buffer);
      }

      stats.optimized.push({
        input: imagePath,
        inputSize,
        outputSize: buffer.length,
        dryRun: options.dryRun,
      });
      stats.totalBytesSaved += inputSize - buffer.length;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      stats.failed.push({ path: imagePath, error: message });
    }
  }

  return stats;
}
