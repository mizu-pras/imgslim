#!/usr/bin/env node

import { Command } from "commander";
import { optimize } from "./optimizer";
import { scanSourceCodeForImages } from "./source-scanner";
import { formatBytes, percentSaved } from "./utils";

const CONVERTIBLE_TO_WEBP_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);

function isConvertibleToWebp(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) return false;
  return CONVERTIBLE_TO_WEBP_EXTENSIONS.has(filePath.slice(dotIndex).toLowerCase());
}

async function main() {
  const program = new Command();

  program
    .name("imgslim")
    .description("ImgSlim converts and optimizes images");

  program
    .command("scan")
    .description("Scan source code for local image references and convert them to WebP")
    .argument("<source...>", "One or more source files or directories")
    .option("-q, --quality <number>", "WebP quality (0-100)", "80")
    .option("-r, --recursive", "Recursively scan directories", false)
    .option("--lossless", "Enable lossless WebP compression", false)
    .option("--overwrite", "Allow overwriting existing WebP output files", false)
    .option("--auto", "Analyze each image and choose the best WebP settings automatically", false)
    .option(
      "--source-ext <extensions>",
      "Comma-separated source file extensions to scan (default: html,css,js,ts,jsx,tsx,vue,svelte,astro,md,mdx)"
    )
    .action(async (sources: string[], options) => {
      const quality = parseInt(options.quality, 10);
      if (isNaN(quality) || quality < 0 || quality > 100) {
        console.error("Error: --quality must be a number between 0 and 100");
        process.exit(1);
      }

      const sourceExtensions = options.sourceExt
        ? String(options.sourceExt)
            .split(",")
            .map((ext) => ext.trim())
            .filter(Boolean)
        : undefined;

      console.log(`Scanning ${sources.length} source input(s)...`);
      if (options.recursive) {
        console.log("Recursive mode enabled");
      }

      const scan = await scanSourceCodeForImages(sources, {
        recursive: options.recursive,
        sourceExtensions,
      });

      console.log(`Found ${scan.images.length} referenced local image(s) in ${scan.sourceFiles} source file(s).`);

      const convertibleImages = scan.images.filter(isConvertibleToWebp);
      const nonConvertibleImages = scan.images.filter((image) => !isConvertibleToWebp(image));

      const stats = await optimize(convertibleImages, {
        outDir: undefined,
        quality,
        lossless: options.lossless,
        recursive: false,
        overwrite: options.overwrite,
        auto: options.auto === true,
      });

      for (const result of stats.converted) {
        const pct = percentSaved(result.inputSize, result.outputSize);
        const saved = result.inputSize - result.outputSize;
        const savedStr = saved >= 0 ? formatBytes(saved) : `+${formatBytes(Math.abs(saved))}`;
        const qualityInfo = result.quality !== undefined ? ` [q${result.quality}]` : "";
        console.log(
          `  OK  ${result.input} -> ${result.output}  (${pct}, ${savedStr})${qualityInfo}`
        );
      }

      for (const skipped of stats.skipped) {
        console.log(` SKIP ${skipped}`);
      }

      for (const skipped of stats.autoSkipped) {
        console.log(` SKIP ${skipped.path}: ${skipped.reason}`);
      }

      for (const image of nonConvertibleImages) {
        console.log(` SKIP ${image}: already WebP or unsupported for WebP conversion`);
      }

      for (const unresolved of scan.unresolved) {
        console.log(` MISS ${unresolved.source}: ${unresolved.reference}`);
      }

      for (const fail of [...scan.failed, ...stats.failed]) {
        console.error(` FAIL ${fail.path}: ${fail.error}`);
      }

      console.log("");
      console.log("──────────────────────────────────────────");
      console.log(`  Source files : ${scan.sourceFiles}`);
      console.log(`  Images found : ${scan.images.length}`);
      console.log(`  Convertible  : ${convertibleImages.length}`);
      console.log(`  Converted    : ${stats.converted.length}`);
      console.log(`  Skipped      : ${stats.skipped.length + stats.autoSkipped.length + nonConvertibleImages.length}`);
      console.log(`  Unresolved   : ${scan.unresolved.length}`);
      console.log(`  Failed       : ${scan.failed.length + stats.failed.length}`);

      if (stats.converted.length > 0) {
        const totalInput = stats.converted.reduce((sum, r) => sum + r.inputSize, 0);
        const totalOutput = stats.converted.reduce((sum, r) => sum + r.outputSize, 0);
        console.log(
          `  Bytes saved  : ${formatBytes(stats.totalBytesSaved)} (${percentSaved(totalInput, totalOutput)})`
        );
      }
      console.log("──────────────────────────────────────────");

      if (scan.failed.length + stats.failed.length > 0) {
        process.exit(1);
      }
    });

  program
    .argument("<input...>", "One or more input files or directories")
    .option("-o, --out-dir <dir>", "Output directory (default: next to input file)")
    .option("-q, --quality <number>", "WebP quality (0-100)", "80")
    .option("-r, --recursive", "Recursively scan directories", false)
    .option("--lossless", "Enable lossless WebP compression", false)
    .option("--overwrite", "Allow overwriting existing output files", false)
    .option("--auto", "Analyze each image and choose the best WebP settings automatically", false)
    .action(async (inputs: string[], options) => {
      const quality = parseInt(options.quality, 10);
      if (isNaN(quality) || quality < 0 || quality > 100) {
        console.error("Error: --quality must be a number between 0 and 100");
        process.exit(1);
      }

      console.log(`Converting ${inputs.length} input(s)...`);
      if (options.recursive) {
        console.log("Recursive mode enabled");
      }

      const stats = await optimize(inputs, {
        outDir: options.outDir,
        quality,
        lossless: options.lossless,
        recursive: options.recursive,
        overwrite: options.overwrite,
        auto: options.auto === true,
      });

      // Print per-file results
      for (const result of stats.converted) {
        const pct = percentSaved(result.inputSize, result.outputSize);
        const saved = result.inputSize - result.outputSize;
        const savedStr = saved >= 0 ? formatBytes(saved) : `+${formatBytes(Math.abs(saved))}`;
        const qualityInfo = result.quality !== undefined ? ` [q${result.quality}]` : "";

        console.log(
          `  OK  ${result.input} -> ${result.output}  (${pct}, ${savedStr})${qualityInfo}`
        );
      }

      for (const skipped of stats.skipped) {
        console.log(` SKIP ${skipped}`);
      }

      for (const skipped of stats.autoSkipped) {
        console.log(` SKIP ${skipped.path}: ${skipped.reason}`);
      }

      for (const fail of stats.failed) {
        console.error(` FAIL ${fail.path}: ${fail.error}`);
      }

      // Print summary
      const totalInput = stats.converted.reduce((sum, r) => sum + r.inputSize, 0);
      const totalOutput = stats.converted.reduce((sum, r) => sum + r.outputSize, 0);

      console.log("");
      console.log("──────────────────────────────────────────");
      console.log(`  Converted : ${stats.converted.length}`);
      console.log(`  Skipped   : ${stats.skipped.length + stats.autoSkipped.length}`);
      console.log(`  Failed    : ${stats.failed.length}`);

      if (stats.converted.length > 0) {
        const pct = totalInput > 0 ? percentSaved(totalInput, totalOutput) : "0%";
        console.log(
          `  Bytes saved: ${formatBytes(stats.totalBytesSaved)} (${pct})`
        );
      }
      console.log("──────────────────────────────────────────");

      if (stats.failed.length > 0) {
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
