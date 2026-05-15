#!/usr/bin/env node

import { Command } from "commander";
import { optimize, isImageFile, OptimizerOptions, OptimizerStats, SkippedResult, ScaleSpec } from "./optimizer";
import { scanSourceCodeForImages, SourceScanResult } from "./source-scanner";
import { formatBytes, percentSaved } from "./utils";
import { loadConfig } from "./config";

// ── Helpers ────────────────────────────────────────────────────────────────

interface OutputOptions {
  verbose: boolean;
  quiet: boolean;
  json: boolean;
}

const DEFAULT_QUALITY = 80;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_INPUT_PIXELS = 268402689;

function validateFlags(auto: boolean, lossless: boolean, quality: number, defaultQuality: number): void {
  if (auto && lossless) {
    process.stderr.write("Warning: --auto overrides --lossless; lossless will not be used in auto mode\n");
  }
  if (auto && quality !== defaultQuality) {
    process.stderr.write("Warning: --quality is ignored in --auto mode (auto tests its own quality levels)\n");
  }
}

function parseQuality(value: string): number {
  const q = parseInt(value, 10);
  if (isNaN(q) || q < 0 || q > 100) {
    process.stderr.write("Error: --quality must be a number between 0 and 100\n");
    process.exit(1);
  }
  return q;
}


function validateSuffix(flag: string, suffix: string): void {
  if (!suffix || suffix.includes("/") || suffix.includes("\\")) {
    process.stderr.write(`Error: ${flag} must not be empty and must not contain path separators\n`);
    process.exit(1);
  }
}

function parseScaleSize(value: string): ScaleSpec {
  const trimmed = value.trim();
  const percentMatch = trimmed.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentMatch) {
    const percent = Number(percentMatch[1]);
    if (Number.isFinite(percent) && percent > 0 && percent < 100) {
      return { type: "percent", value: percent };
    }
  }

  const dimensionMatch = trimmed.match(/^(\d*)x(\d*)$/i);
  if (dimensionMatch) {
    const width = dimensionMatch[1] ? Number.parseInt(dimensionMatch[1], 10) : undefined;
    const height = dimensionMatch[2] ? Number.parseInt(dimensionMatch[2], 10) : undefined;
    if ((width || height) && (width === undefined || width > 0) && (height === undefined || height > 0)) {
      return { type: "dimensions", width, height };
    }
  }

  process.stderr.write("Error: --size must be like 50%, 800x600, 800x, or x600\n");
  process.exit(1);
}

function parsePositiveInteger(flag: string, value: string, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    process.stderr.write(`Error: ${flag} must be a positive integer\n`);
    process.exit(1);
  }
  return Math.min(parsed, max);
}

function normalizeConversionFlags(auto: boolean, lossless: boolean): { auto: boolean; lossless: boolean } {
  return {
    auto,
    lossless: auto ? false : lossless,
  };
}

function formatSkipped(skipped: SkippedResult): string {
  const target = skipped.output ? `${skipped.input} -> ${skipped.output}` : skipped.input;
  return `${target}: ${skipped.reason}`;
}

function emptyStats(): OptimizerStats {
  return { converted: [], skipped: [], autoSkipped: [], failed: [], totalBytesSaved: 0 };
}

function collectAliases(values: string[] | undefined, configAliases: Record<string, string> | undefined): Record<string, string> | undefined {
  const aliases: Record<string, string> = { ...(configAliases ?? {}) };
  for (const value of values ?? []) {
    const eqIndex = value.indexOf("=");
    if (eqIndex <= 0 || eqIndex === value.length - 1) {
      process.stderr.write(`Error: --alias must use prefix=dir format, got "${value}"\n`);
      process.exit(1);
    }
    aliases[value.slice(0, eqIndex)] = value.slice(eqIndex + 1);
  }
  return Object.keys(aliases).length > 0 ? aliases : undefined;
}

function buildOptimizerOptions(base: Partial<OptimizerOptions> & { quality: number; recursive: boolean; overwrite: boolean; auto: boolean; lossless: boolean }, concurrency: number, maxInputPixels: number): OptimizerOptions {
  return {
    outDir: base.outDir,
    quality: base.quality,
    recursive: base.recursive,
    overwrite: base.overwrite,
    auto: base.auto,
    lossless: base.lossless,
    concurrency,
    maxInputPixels,
    mode: base.mode,
    minifyDryRun: base.minifyDryRun,
    minifySuffix: base.minifySuffix,
    minifyLosslessOnly: base.minifyLosslessOnly,
    scaleDryRun: base.scaleDryRun,
    scaleSuffix: base.scaleSuffix,
    scaleSize: base.scaleSize,
    onProgress: base.onProgress,
  };
}

function getOutputOptions(program: Command): OutputOptions {
  const opts = program.opts<{ json?: boolean; verbose?: boolean; quiet?: boolean }>();
  return {
    json: opts.json === true,
    verbose: opts.verbose === true,
    quiet: opts.quiet === true,
  };
}

function printResults(stats: OptimizerStats, opts: OutputOptions): void {
  if (!opts.quiet && !opts.json) {
    for (const result of stats.converted) {
      const pct = percentSaved(result.inputSize, result.outputSize);
      const saved = result.inputSize - result.outputSize;
      const savedStr = saved >= 0 ? formatBytes(saved) : `+${formatBytes(Math.abs(saved))}`;
      const qualityInfo = result.quality !== undefined ? ` [q${result.quality}]` : "";
      const timing = opts.verbose ? ` [${result.durationMs}ms]` : "";
      console.log(
        `  OK  ${result.input} -> ${result.output}  (${pct}, ${savedStr})${qualityInfo}${timing}`
      );
    }

    for (const skipped of stats.skipped) {
      console.log(` SKIP ${formatSkipped(skipped)}`);
    }

    for (const skipped of stats.autoSkipped) {
      console.log(` SKIP ${skipped.path}: ${skipped.reason}`);
    }
  }

  if (!opts.json) {
    for (const fail of stats.failed) {
      process.stderr.write(` FAIL ${fail.path}: ${fail.error}\n`);
    }
  }
}

function buildJsonOutput(stats: OptimizerStats, scan?: SourceScanResult, extra?: Record<string, unknown>): string {
  const totalInput = stats.converted.reduce((sum, r) => sum + r.inputSize, 0);
  const result: Record<string, unknown> = {
    converted: stats.converted,
    skipped: stats.skipped,
    autoSkipped: stats.autoSkipped,
    failed: stats.failed,
    summary: {
      converted: stats.converted.length,
      skipped: stats.skipped.length + stats.autoSkipped.length,
      failed: stats.failed.length + (scan?.failed.length ?? 0),
      bytesSaved: stats.totalBytesSaved,
      percentSaved: totalInput > 0
        ? `${((stats.totalBytesSaved / totalInput) * 100).toFixed(1)}%`
        : "0%",
    },
  };

  if (scan) {
    result.scan = {
      sourceFiles: scan.sourceFiles,
      imagesFound: scan.images.length,
      unresolved: scan.unresolved,
      scanFailed: scan.failed,
    };
  }

  if (extra) {
    Object.assign(result, extra);
  }

  return JSON.stringify(result, null, 2);
}

function printSummary(stats: OptimizerStats, actionLabel = "Converted"): void {
  const totalInput = stats.converted.reduce((sum, r) => sum + r.inputSize, 0);

  console.log("");
  console.log("──────────────────────────────────────────");
  console.log(`  ${actionLabel.padEnd(9)}: ${stats.converted.length}`);
  console.log(`  Skipped   : ${stats.skipped.length + stats.autoSkipped.length}`);
  console.log(`  Failed    : ${stats.failed.length}`);

  if (stats.converted.length > 0) {
    const pct = totalInput > 0
      ? `${((stats.totalBytesSaved / totalInput) * 100).toFixed(1)}%`
      : "0%";
    console.log(
      `  Bytes saved: ${formatBytes(stats.totalBytesSaved)} (${pct})`
    );
  }
  console.log("──────────────────────────────────────────");
}

async function runConvert(
  inputs: string[],
  options: {
    quality: number;
    lossless: boolean;
    overwrite: boolean;
    auto: boolean;
    recursive: boolean;
    outDir?: string;
    concurrency: number;
    maxInputPixels: number;
  },
  outOpts: OutputOptions
): Promise<OptimizerStats> {
  const normalized = normalizeConversionFlags(options.auto, options.lossless);
  const stats = await optimize(inputs, buildOptimizerOptions({
    outDir: options.outDir,
    quality: options.quality,
    lossless: normalized.lossless,
    recursive: options.recursive,
    overwrite: options.overwrite,
    auto: normalized.auto,
    onProgress: (outOpts.quiet || outOpts.json)
      ? undefined
      : (file, current, total) => {
          process.stderr.write(`\r  Converting [${current}/${total}] ${file}`);
        },
  }, options.concurrency, options.maxInputPixels));

  if (!outOpts.json) {
    printResults(stats, outOpts);
  }

  return stats;
}

function printScanSummary(
  stats: OptimizerStats,
  scan: SourceScanResult,
  convertibleCount: number,
  nonConvertibleCount: number
): void {
  console.log("");
  console.log("──────────────────────────────────────────");
  console.log(`  Source files : ${scan.sourceFiles}`);
  console.log(`  Images found : ${scan.images.length}`);
  console.log(`  Convertible  : ${convertibleCount}`);
  console.log(`  Converted    : ${stats.converted.length}`);
  console.log(`  Skipped      : ${stats.skipped.length + stats.autoSkipped.length + nonConvertibleCount}`);
  console.log(`  Unresolved   : ${scan.unresolved.length}`);
  console.log(`  Failed       : ${scan.failed.length + stats.failed.length}`);

  if (stats.converted.length > 0) {
    const totalInput = stats.converted.reduce((sum, r) => sum + r.inputSize, 0);
    const pct = totalInput > 0
      ? `${((stats.totalBytesSaved / totalInput) * 100).toFixed(1)}%`
      : "0%";
    console.log(
      `  Bytes saved  : ${formatBytes(stats.totalBytesSaved)} (${pct})`
    );
  }
  console.log("──────────────────────────────────────────");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const program = new Command();

  program
    .name("imgslim")
    .description("ImgSlim converts and optimizes images")
    // Global options only — shared by all commands
    .option("--json", "Output results as JSON (for CI/CD pipelines)", config.json ?? false)
    .option("--no-json", "Disable JSON output")
    .option("--verbose", "Show extra detail including timing", config.verbose ?? false)
    .option("--quiet", "Suppress per-file output, show summary only", config.quiet ?? false)
    .option("--no-quiet", "Disable quiet mode");

  // ── scan command ──────────────────────────────────────────────────────────

  program
    .command("scan")
    .description("Scan source code for local image references and convert them to WebP")
    .argument("<source...>", "One or more source files or directories")
    .option("--dry-run", "Show what would be converted without writing any files", false)
    .option(
      "--source-ext <extensions>",
      "Comma-separated source file extensions to scan",
      config.sourceExt
    )
    .option("-q, --quality <number>", "WebP quality (0-100)", String(config.quality ?? 80))
    .option("--lossless", "Enable lossless WebP compression", config.lossless ?? false)
    .option("--no-lossless", "Disable lossless mode")
    .option("--overwrite", "Allow overwriting existing WebP output files", config.overwrite ?? false)
    .option("--no-overwrite", "Disable overwrite mode")
    .option("--auto", "Analyze each image and choose the best WebP settings automatically", config.auto ?? false)
    .option("--no-auto", "Disable auto mode")
    .option("-r, --recursive", "Recursively scan directories", config.recursive ?? false)
    .option("--no-recursive", "Disable recursive mode")
    .option("--asset-root <dir>", "Resolve absolute-style scanned asset references from this directory", config.assetRoot)
    .option("--alias <prefix=dir>", "Resolve scanned asset aliases (repeatable)", (value: string, previous: string[] = []) => [...previous, value], [])
    .option("--concurrency <number>", "Max parallel image conversions", String(config.concurrency ?? DEFAULT_CONCURRENCY))
    .option("--max-input-pixels <number>", "Sharp input pixel safety limit", String(config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS))
    .action(async (sources: string[], options) => {
      const quality = parseQuality(options.quality ?? String(config.quality ?? DEFAULT_QUALITY));
      const auto = options.auto === true;
      validateFlags(auto, options.lossless === true, quality, config.quality ?? DEFAULT_QUALITY);
      const concurrency = parsePositiveInteger("--concurrency", String(options.concurrency ?? config.concurrency ?? DEFAULT_CONCURRENCY), 64);
      const maxInputPixels = parsePositiveInteger("--max-input-pixels", String(options.maxInputPixels ?? config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS));

      const outOpts = getOutputOptions(program);

      const sourceExtensions = options.sourceExt
        ? String(options.sourceExt)
            .split(",")
            .map((ext) => ext.trim())
            .filter(Boolean)
        : undefined;

      const dryRun = options.dryRun === true;
      const aliases = collectAliases(options.alias as string[] | undefined, config.aliases);

      if (!outOpts.quiet && !outOpts.json) {
        console.log(`Scanning ${sources.length} source input(s)...`);
        if (options.recursive) console.log("Recursive mode enabled");
        if (dryRun) console.log("Dry-run mode: no files will be written");
      }

      const scan = await scanSourceCodeForImages(sources, {
        recursive: options.recursive === true,
        sourceExtensions,
        assetRoot: options.assetRoot,
        aliases,
        onProgress: (outOpts.quiet || outOpts.json)
          ? undefined
          : (file, current, total) => {
              process.stderr.write(`\r  Scanning [${current}/${total}] ${file}`);
            },
      });

      if (!outOpts.quiet && !outOpts.json) {
        process.stderr.write("\r" + " ".repeat(80) + "\r");
        console.log(`Found ${scan.images.length} referenced local image(s) in ${scan.sourceFiles} source file(s).`);
      }

      const convertibleImages = scan.images.filter(isImageFile);
      const nonConvertibleImages = scan.images.filter((image) => !isImageFile(image));

      // Dry-run
      if (dryRun) {
        if (outOpts.json) {
          const dryResult = buildJsonOutput(
            emptyStats(),
            scan,
            { dryRun: true, wouldConvert: convertibleImages }
          );
          console.log(dryResult);
          return;
        }

        console.log("");
        if (convertibleImages.length > 0) {
          console.log("Would convert:");
          for (const img of convertibleImages) {
            const out = img.replace(/\.(png|jpe?g|svg)$/i, "") + ".webp";
            console.log(`  ${img} -> ${out}`);
          }
        }
        if (!outOpts.quiet && !outOpts.json) {
          for (const img of nonConvertibleImages) {
            console.log(`  SKIP ${img}: already WebP or unsupported for WebP conversion`);
          }
          for (const unresolved of scan.unresolved) {
            console.log(`  MISS ${unresolved.source}: ${unresolved.reference}`);
          }
        }
        if (!outOpts.json) {
          for (const fail of scan.failed) {
            process.stderr.write(`  FAIL ${fail.path}: ${fail.error}\n`);
          }
        }
        printScanSummary(
          emptyStats(),
          scan,
          convertibleImages.length,
          nonConvertibleImages.length
        );
        if (scan.failed.length > 0) process.exit(1);
        return;
      }

      const stats = await runConvert(convertibleImages, {
        quality,
        lossless: options.lossless === true,
        recursive: false,
        overwrite: options.overwrite === true,
        auto,
        concurrency,
        maxInputPixels,
      }, outOpts);

      if (outOpts.json) {
        console.log(buildJsonOutput(stats, scan));
        if (scan.failed.length + stats.failed.length > 0) process.exit(1);
        return;
      }

      if (!outOpts.quiet && !outOpts.json) {
        for (const image of nonConvertibleImages) {
          console.log(` SKIP ${image}: already WebP or unsupported for WebP conversion`);
        }

        for (const unresolved of scan.unresolved) {
          console.log(` MISS ${unresolved.source}: ${unresolved.reference}`);
        }
      }

      if (!outOpts.json) {
        for (const fail of scan.failed) {
          process.stderr.write(` FAIL ${fail.path}: ${fail.error}\n`);
        }
      }

      printScanSummary(stats, scan, convertibleImages.length, nonConvertibleImages.length);

      if (scan.failed.length + stats.failed.length > 0) process.exit(1);
    });

  // ── convert subcommand ─────────────────────────────────────────────────

  program
    .command("convert")
    .description("Convert images to WebP format (explicit subcommand)")
    .argument("<input...>", "One or more input files or directories")
    .option("-q, --quality <number>", "WebP quality (0-100)", String(config.quality ?? 80))
    .option("--lossless", "Enable lossless WebP compression", config.lossless ?? false)
    .option("--no-lossless", "Disable lossless mode")
    .option("--overwrite", "Allow overwriting existing WebP output files", config.overwrite ?? false)
    .option("--no-overwrite", "Disable overwrite mode")
    .option("--auto", "Analyze each image and choose the best WebP settings automatically", config.auto ?? false)
    .option("--no-auto", "Disable auto mode")
    .option("-r, --recursive", "Recursively scan directories", config.recursive ?? false)
    .option("--no-recursive", "Disable recursive mode")
    .option("-o, --out-dir <dir>", "Output directory for converted WebP files", config.outDir)
    .option("--concurrency <number>", "Max parallel image conversions", String(config.concurrency ?? DEFAULT_CONCURRENCY))
    .option("--max-input-pixels <number>", "Sharp input pixel safety limit", String(config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS))
    .action(async (inputs: string[], options) => {
      const quality = parseQuality(options.quality ?? String(config.quality ?? DEFAULT_QUALITY));
      const auto = options.auto === true;
      validateFlags(auto, options.lossless === true, quality, config.quality ?? DEFAULT_QUALITY);
      const concurrency = parsePositiveInteger("--concurrency", String(options.concurrency ?? config.concurrency ?? DEFAULT_CONCURRENCY), 64);
      const maxInputPixels = parsePositiveInteger("--max-input-pixels", String(options.maxInputPixels ?? config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS));

      const outOpts = getOutputOptions(program);

      if (!outOpts.quiet && !outOpts.json) {
        console.log(`Converting ${inputs.length} input(s)...`);
        if (options.recursive) console.log("Recursive mode enabled");
      }

      const stats = await runConvert(inputs, {
        outDir: options.outDir,
        quality,
        lossless: options.lossless === true,
        recursive: options.recursive === true,
        overwrite: options.overwrite === true,
        auto,
        concurrency,
        maxInputPixels,
      }, outOpts);

      if (outOpts.json) {
        console.log(buildJsonOutput(stats));
        if (stats.failed.length > 0) process.exit(1);
        return;
      }

      printSummary(stats);

      if (stats.failed.length > 0) process.exit(1);
    });

  // ── minify subcommand ──────────────────────────────────────────────────

  program
    .command("minify")
    .description("Minify PNG images (creates _min.png output by default)")
    .argument("<input...>", "One or more input files or directories")
    .option("--dry-run", "Show what would be converted without writing files", false)
    .option("--suffix <suffix>", "Output suffix (default: _min)", "_min")
    .option("-o, --out-dir <dir>", "Output directory for minified PNG files")
    .option("--overwrite", "Replace existing _min.png output (default: skip if exists)", false)
    .option("--lossless-only", "Avoid palette quantization (lossless quality, may save less)", false)
    .option("-r, --recursive", "Recursively scan directories", false)
    .option("--concurrency <number>", "Max parallel image conversions", String(config.concurrency ?? DEFAULT_CONCURRENCY))
    .option("--max-input-pixels <number>", "Sharp input pixel safety limit", String(config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS))
    .action(async (inputs: string[], options) => {
      const suffix = options.suffix ?? "_min";
      validateSuffix("--suffix", suffix);

      const outOpts = getOutputOptions(program);
      const dryRun = options.dryRun === true;
      const concurrency = parsePositiveInteger("--concurrency", String(options.concurrency ?? config.concurrency ?? DEFAULT_CONCURRENCY), 64);
      const maxInputPixels = parsePositiveInteger("--max-input-pixels", String(options.maxInputPixels ?? config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS));

      if (!outOpts.quiet && !outOpts.json) {
        if (options.lossless) process.stderr.write("Warning: --lossless is ignored in minify mode\n");
        if (options.auto) process.stderr.write("Warning: --auto is ignored in minify mode\n");
      }

      if (!outOpts.quiet && !outOpts.json) {
        console.log(`Minifying ${inputs.length} input(s)...`);
        if (dryRun) console.log("Dry-run mode: no files will be written");
        if (options.recursive) console.log("Recursive mode enabled");
      }

      const stats = await optimize(inputs, buildOptimizerOptions({
        outDir: options.outDir,
        quality: DEFAULT_QUALITY,
        lossless: false,
        recursive: options.recursive === true,
        overwrite: options.overwrite === true,
        auto: false,
        mode: "minify",
        minifyDryRun: dryRun,
        minifySuffix: suffix,
        minifyLosslessOnly: options.losslessOnly === true,
        onProgress: (outOpts.quiet || outOpts.json)
          ? undefined
          : (file, current, total) => {
              process.stderr.write(`\r  Minifying [${current}/${total}] ${file}`);
            },
      }, concurrency, maxInputPixels));

      if (outOpts.json) {
        console.log(buildJsonOutput(stats));
        if (stats.failed.length > 0) process.exit(1);
        return;
      }

      if (dryRun) {
        // Print dry-run results with clear labels
        const wouldConverts: string[] = [];
        const skips: string[] = [];
        for (const s of stats.skipped) {
          if (s.status === "would-convert") {
            wouldConverts.push(formatSkipped(s));
          } else {
            skips.push(formatSkipped(s));
          }
        }
        if (wouldConverts.length > 0) {
          console.log("Would scale:");
          for (const entry of wouldConverts) {
            console.log(`  ${entry}`);
          }
        }
        for (const msg of skips) {
          console.log(` SKIP ${msg}`);
        }
      } else {
        printResults(stats, outOpts);
      }

      printSummary(stats, "Minified");

      if (stats.failed.length > 0) process.exit(1);
    });


  // ── scale subcommand ───────────────────────────────────────────────────

  program
    .command("scale")
    .description("Scale images to a smaller size (creates _scaled output by default)")
    .argument("<input...>", "One or more input files or directories")
    .requiredOption("--size <size>", "Scale size: 50%, 800x600, 800x, or x600")
    .option("--dry-run", "Show what would be scaled without writing files", false)
    .option("--suffix <suffix>", "Output suffix (default: _scaled)", "_scaled")
    .option("-o, --out-dir <dir>", "Output directory for scaled image files")
    .option("--overwrite", "Replace existing scaled output (default: skip if exists)", false)
    .option("-r, --recursive", "Recursively scan directories", false)
    .option("--concurrency <number>", "Max parallel image scaling operations", String(config.concurrency ?? DEFAULT_CONCURRENCY))
    .option("--max-input-pixels <number>", "Sharp input pixel safety limit", String(config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS))
    .action(async (inputs: string[], options) => {
      const suffix = options.suffix ?? "_scaled";
      validateSuffix("--suffix", suffix);
      const scaleSize = parseScaleSize(String(options.size));

      const outOpts = getOutputOptions(program);
      const dryRun = options.dryRun === true;
      const concurrency = parsePositiveInteger("--concurrency", String(options.concurrency ?? config.concurrency ?? DEFAULT_CONCURRENCY), 64);
      const maxInputPixels = parsePositiveInteger("--max-input-pixels", String(options.maxInputPixels ?? config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS));

      if (!outOpts.quiet && !outOpts.json) {
        console.log(`Scaling ${inputs.length} input(s)...`);
        if (dryRun) console.log("Dry-run mode: no files will be written");
        if (options.recursive) console.log("Recursive mode enabled");
      }

      const stats = await optimize(inputs, buildOptimizerOptions({
        outDir: options.outDir,
        quality: DEFAULT_QUALITY,
        lossless: false,
        recursive: options.recursive === true,
        overwrite: options.overwrite === true,
        auto: false,
        mode: "scale",
        scaleDryRun: dryRun,
        scaleSuffix: suffix,
        scaleSize,
        onProgress: (outOpts.quiet || outOpts.json)
          ? undefined
          : (file, current, total) => {
              process.stderr.write(`\r  Scaling [${current}/${total}] ${file}`);
            },
      }, concurrency, maxInputPixels));

      if (outOpts.json) {
        console.log(buildJsonOutput(stats));
        if (stats.failed.length > 0) process.exit(1);
        return;
      }

      if (dryRun) {
        const wouldConverts: string[] = [];
        const skips: string[] = [];
        for (const s of stats.skipped) {
          if (s.status === "would-convert") {
            wouldConverts.push(formatSkipped(s));
          } else {
            skips.push(formatSkipped(s));
          }
        }
        if (wouldConverts.length > 0) {
          console.log("Would scale:");
          for (const entry of wouldConverts) {
            console.log(`  ${entry}`);
          }
        }
        for (const msg of skips) {
          console.log(` SKIP ${msg}`);
        }
      } else {
        printResults(stats, outOpts);
      }

      printSummary(stats, "Scaled");

      if (stats.failed.length > 0) process.exit(1);
    });

  // ── default command (direct conversion) ───────────────────────────────────

  program
    .command("default", { isDefault: true, hidden: true })
    .description("Convert images to WebP")
    .argument("<input...>", "One or more input files or directories")
    .option("-q, --quality <number>", "WebP quality (0-100)", String(config.quality ?? 80))
    .option("--lossless", "Enable lossless WebP compression", config.lossless ?? false)
    .option("--no-lossless", "Disable lossless mode")
    .option("--overwrite", "Allow overwriting existing WebP output files", config.overwrite ?? false)
    .option("--no-overwrite", "Disable overwrite mode")
    .option("--auto", "Analyze each image and choose the best WebP settings automatically", config.auto ?? false)
    .option("--no-auto", "Disable auto mode")
    .option("-r, --recursive", "Recursively scan directories", config.recursive ?? false)
    .option("--no-recursive", "Disable recursive mode")
    .option("-o, --out-dir <dir>", "Output directory for converted WebP files", config.outDir)
    .option("--concurrency <number>", "Max parallel image conversions", String(config.concurrency ?? DEFAULT_CONCURRENCY))
    .option("--max-input-pixels <number>", "Sharp input pixel safety limit", String(config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS))
    .action(async (inputs: string[], options) => {
      const quality = parseQuality(options.quality ?? String(config.quality ?? DEFAULT_QUALITY));
      const auto = options.auto === true;
      validateFlags(auto, options.lossless === true, quality, config.quality ?? DEFAULT_QUALITY);
      const concurrency = parsePositiveInteger("--concurrency", String(options.concurrency ?? config.concurrency ?? DEFAULT_CONCURRENCY), 64);
      const maxInputPixels = parsePositiveInteger("--max-input-pixels", String(options.maxInputPixels ?? config.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS));

      const outOpts = getOutputOptions(program);

      if (!outOpts.quiet && !outOpts.json) {
        console.log(`Converting ${inputs.length} input(s)...`);
        if (options.recursive) console.log("Recursive mode enabled");
      }

      const stats = await runConvert(inputs, {
        outDir: options.outDir,
        quality,
        lossless: options.lossless === true,
        recursive: options.recursive === true,
        overwrite: options.overwrite === true,
        auto,
        concurrency,
        maxInputPixels,
      }, outOpts);

      if (outOpts.json) {
        console.log(buildJsonOutput(stats));
        if (stats.failed.length > 0) process.exit(1);
        return;
      }

      printSummary(stats);

      if (stats.failed.length > 0) process.exit(1);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
