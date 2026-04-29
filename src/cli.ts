#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { Command } from "commander";
import { optimize, isImageFile, OptimizerStats } from "./optimizer";
import { scanSourceCodeForImages, SourceScanResult } from "./source-scanner";
import { formatBytes, percentSaved } from "./utils";
import { loadConfig, ImgSlimConfig } from "./config";

// ── Helpers ────────────────────────────────────────────────────────────────

interface OutputOptions {
  verbose: boolean;
  quiet: boolean;
  json: boolean;
}

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

function getOutputOptions(program: Command): OutputOptions {
  const opts = program.opts<{ json?: boolean; verbose?: boolean; quiet?: boolean }>();
  return {
    json: opts.json === true,
    verbose: opts.verbose === true,
    quiet: opts.quiet === true,
  };
}

function printResults(stats: OptimizerStats, opts: OutputOptions, startedAt?: number): void {
  if (opts.quiet || opts.json) return;

  const elapsed = startedAt !== undefined ? ` [${(performance.now() - startedAt).toFixed(0)}ms]` : "";

  for (const result of stats.converted) {
    const pct = percentSaved(result.inputSize, result.outputSize);
    const saved = result.inputSize - result.outputSize;
    const savedStr = saved >= 0 ? formatBytes(saved) : `+${formatBytes(Math.abs(saved))}`;
    const qualityInfo = result.quality !== undefined ? ` [q${result.quality}]` : "";
    const timing = opts.verbose ? elapsed : "";
    console.log(
      `  OK  ${result.input} -> ${result.output}  (${pct}, ${savedStr})${qualityInfo}${timing}`
    );
  }

  for (const skipped of stats.skipped) {
    console.log(` SKIP ${skipped}`);
  }

  for (const skipped of stats.autoSkipped) {
    console.log(` SKIP ${skipped.path}: ${skipped.reason}`);
  }

  for (const fail of stats.failed) {
    process.stderr.write(` FAIL ${fail.path}: ${fail.error}\n`);
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

function printSummary(stats: OptimizerStats): void {
  const totalInput = stats.converted.reduce((sum, r) => sum + r.inputSize, 0);

  console.log("");
  console.log("──────────────────────────────────────────");
  console.log(`  Converted : ${stats.converted.length}`);
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
    // Global options (Commander v12 workaround: boolean flags must be on program, not subcommands)
    .option("--json", "Output results as JSON (for CI/CD pipelines)", config.json ?? false)
    .option("--verbose", "Show extra detail including timing", config.verbose ?? false)
    .option("--quiet", "Suppress per-file output, show summary only", config.quiet ?? false)
    .option("--lossless", "Enable lossless WebP compression", config.lossless ?? false)
    .option("--overwrite", "Allow overwriting existing WebP output files", config.overwrite ?? false)
    .option("--auto", "Analyze each image and choose the best WebP settings automatically", config.auto ?? false)
    .option("-r, --recursive", "Recursively scan directories", config.recursive ?? false);

  // ── scan command ──────────────────────────────────────────────────────────

  program
    .command("scan")
    .description("Scan source code for local image references and convert them to WebP")
    .argument("<source...>", "One or more source files or directories")
    .option("-q, --quality <number>", "WebP quality (0-100)", String(config.quality ?? 80))
    .option("--dry-run", "Show what would be converted without writing any files", false)
    .option(
      "--source-ext <extensions>",
      "Comma-separated source file extensions to scan",
      config.sourceExt
    )
    .action(async (sources: string[], options) => {
      const globalOpts = program.opts<{ lossless?: boolean; overwrite?: boolean; auto?: boolean; recursive?: boolean }>();
      const quality = parseQuality(options.quality);
      const auto = globalOpts.auto === true;
      validateFlags(auto, globalOpts.lossless === true, quality, config.quality ?? 80);

      const outOpts = getOutputOptions(program);

      const sourceExtensions = options.sourceExt
        ? String(options.sourceExt)
            .split(",")
            .map((ext) => ext.trim())
            .filter(Boolean)
        : undefined;

      const dryRun = options.dryRun === true;

      if (!outOpts.quiet && !outOpts.json) {
        console.log(`Scanning ${sources.length} source input(s)...`);
        if (globalOpts.recursive) console.log("Recursive mode enabled");
        if (dryRun) console.log("Dry-run mode: no files will be written");
      }

      const scan = await scanSourceCodeForImages(sources, {
        recursive: globalOpts.recursive === true,
        sourceExtensions,
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
            { converted: [], skipped: [], autoSkipped: [], failed: [], totalBytesSaved: 0 },
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
        for (const fail of scan.failed) {
          process.stderr.write(`  FAIL ${fail.path}: ${fail.error}\n`);
        }
        }
        printScanSummary(
          { converted: [], skipped: [], autoSkipped: [], failed: [], totalBytesSaved: 0 },
          scan,
          convertibleImages.length,
          nonConvertibleImages.length
        );
        if (scan.failed.length > 0) process.exit(1);
        return;
      }

      const startedAt = outOpts.verbose ? performance.now() : undefined;

      const stats = await optimize(convertibleImages, {
        outDir: undefined,
        quality,
        lossless: globalOpts.lossless === true,
        recursive: false,
        overwrite: globalOpts.overwrite === true,
        auto,
        onProgress: (outOpts.quiet || outOpts.json)
          ? undefined
          : (file, current, total) => {
              process.stderr.write(`\r  Converting [${current}/${total}] ${file}`);
            },
      });

      if (outOpts.json) {
        console.log(buildJsonOutput(stats, scan));
        if (scan.failed.length + stats.failed.length > 0) process.exit(1);
        return;
      }

      printResults(stats, outOpts, startedAt);

      if (!outOpts.quiet && !outOpts.json) {
      for (const image of nonConvertibleImages) {
        console.log(` SKIP ${image}: already WebP or unsupported for WebP conversion`);
      }

      for (const unresolved of scan.unresolved) {
        console.log(` MISS ${unresolved.source}: ${unresolved.reference}`);
      }

      for (const fail of [...scan.failed, ...stats.failed]) {
        process.stderr.write(` FAIL ${fail.path}: ${fail.error}\n`);
      }
      }

      printScanSummary(stats, scan, convertibleImages.length, nonConvertibleImages.length);

      if (scan.failed.length + stats.failed.length > 0) process.exit(1);
    });

  // ── default command (direct conversion) ───────────────────────────────────

  program
    .argument("<input...>", "One or more input files or directories")
    .option("-o, --out-dir <dir>", "Output directory", config.outDir)
    .option("-q, --quality <number>", "WebP quality (0-100)", String(config.quality ?? 80))
    .action(async (inputs: string[], options) => {
      const globalOpts = program.opts<{ lossless?: boolean; overwrite?: boolean; auto?: boolean; recursive?: boolean }>();
      const quality = parseQuality(options.quality);
      const auto = globalOpts.auto === true;
      validateFlags(auto, globalOpts.lossless === true, quality, config.quality ?? 80);

      const outOpts = getOutputOptions(program);

      if (!outOpts.quiet && !outOpts.json) {
        console.log(`Converting ${inputs.length} input(s)...`);
        if (globalOpts.recursive) console.log("Recursive mode enabled");
      }

      const startedAt = outOpts.verbose ? performance.now() : undefined;

      const stats = await optimize(inputs, {
        outDir: options.outDir,
        quality,
        lossless: globalOpts.lossless === true,
        recursive: globalOpts.recursive === true,
        overwrite: globalOpts.overwrite === true,
        auto,
        onProgress: (outOpts.quiet || outOpts.json)
          ? undefined
          : (file, current, total) => {
              process.stderr.write(`\r  Converting [${current}/${total}] ${file}`);
            },
      });

      if (outOpts.json) {
        console.log(buildJsonOutput(stats));
        if (stats.failed.length > 0) process.exit(1);
        return;
      }

      printResults(stats, outOpts, startedAt);
      printSummary(stats);

      if (stats.failed.length > 0) process.exit(1);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
