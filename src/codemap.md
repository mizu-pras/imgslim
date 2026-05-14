# src codemap

## Responsibility

- Implements `imgslim` CLI runtime defined in `package.json` (`dist/cli.js` from `src/cli.ts`).
- Handles three user-facing workflows: source-image scanning, WebP conversion, PNG minification.
- Centralizes config loading, shared file discovery, optimization execution, and result formatting.

## Design Patterns

- Thin orchestration in `src/cli.ts`; heavy file-processing logic delegated to `optimize()` and `scanSourceCodeForImages()`.
- Shared stats accumulator: `OptimizerStats` carries `converted`, structured `skipped`, `autoSkipped`, `failed`, and `totalBytesSaved` across modes.
- Mode switch in `optimize()` via `OptimizerOptions.mode` chooses `convertFile()` vs `minifyFile()`.
- Shared recursive walker in `src/file-walker.ts` uses `realpathSync()` + visited sets to avoid symlink cycles; optimizer and scanner provide file filters.
- Atomic output writes via `tmpPathFor()`, `atomicWriteFile()`, `atomicSharpToFile()` prevent partial output files.
- Bounded concurrency via `processPool()`; `--concurrency` / config controls batch parallelism while aggregation remains deterministic by input order.
- Sharp input safety uses `maxInputPixels` from CLI/config to guard oversized image decode paths.

## Data & Control Flow

- Startup: `main()` in `src/cli.ts` calls `loadConfig()` then builds Commander commands `scan`, `convert`, `minify`, and hidden default convert path.
- Flag handling: `parseQuality()`, `parsePositiveInteger()`, `parseAliases()`, `validateFlags()`, and `getOutputOptions()` normalize CLI state before work starts; `--no-*` flags can override boolean config values.
- Scan flow:
  - `scan` action calls `scanSourceCodeForImages()`.
  - `collectSourceFiles()` gathers source files by extension through `walkMatchingFiles()`, skipping ignored dirs like `node_modules` and `dist`.
  - `IMAGE_REFERENCE_RE`, `MARKDOWN_REFERENCE_RE`, and `SRCSET_REFERENCE_RE` extract local asset references; `resolveReference()` handles relative paths, absolute-style paths, `@/` asset-root paths, and configured aliases.
  - CLI splits results with `isImageFile()` into convertible vs non-convertible images, then either reports dry-run or forwards convertible files to `optimize()`.
- Convert flow:
  - `runConvert()` handles both explicit `convert` and hidden default command.
  - `optimize()` expands input files/directories through `findImageFiles()` and skips output collisions before conversion.
  - `convertFile()` computes output with `resolveOutputPath()`, creates directories, then uses guarded Sharp instances for WebP conversion.
  - `analyzeAndConvert()` implements `--auto`: tries qualities `[90, 80, 70, 60]` sequentially to reduce memory, prefers highest quality with >=10% reduction, else smallest candidate below original, else records `autoSkipped`.
- Minify flow:
  - `optimize()` switches to minify mode when `mode === "minify"` and accepts broader input set through `isMinifyCandidateFile()`.
  - Minify preprocessing dedupes inputs, skips files already ending with active suffix, and detects output collisions.
  - `minifyFile()` currently supports only `.png`; skips symlinks and animated PNGs, writes `_min` output through Sharp PNG recompression, keeps file mode with `chmod()`.
- Output flow:
  - `printResults()`, `printSummary()`, `printScanSummary()`, `buildJsonOutput()` render human and JSON output; JSON `skipped` entries are structured objects.
  - `formatBytes()` and `percentSaved()` in `src/utils.ts` provide presentation helpers.
  - CLI exits non-zero when scan/optimization failures collected in stats; `--quiet` still prints `FAIL` lines to stderr.

## Integration Points

- `commander` in `src/cli.ts` provides command parsing and option defaults.
- `sharp` in `src/optimizer.ts` performs WebP conversion, PNG metadata reads, and minification.
- Node built-ins:
  - `fs`/`fs/promises` for traversal, stat checks, mkdir, atomic rename, cleanup.
  - `path` for output path derivation and reference resolution.
  - `perf_hooks` for verbose timing in CLI output.
  - `os.homedir()` in `src/config.ts` for home-level `.imgslimrc`.
- Config integration: `loadConfig()` merges `~/.imgslimrc` with local `.imgslimrc`, local wins; schema validates quality, booleans, concurrency, max input pixels, asset root, and aliases.
- Build integration: `tsconfig.json` compiles `src/**/*` to CommonJS `dist/`; package bin points CLI consumers to built output.

## Key Files

- `src/cli.ts`: entrypoint; defines commands, validates flags, dispatches workflows, formats terminal/JSON summaries.
- `src/optimizer.ts`: core processing engine; file discovery, concurrency control, WebP conversion, auto mode, PNG minify, atomic writes.
- `src/source-scanner.ts`: source-code asset scanner; resolves local image references from HTML/CSS/JS/TS-like files.
- `src/file-walker.ts`: shared recursive filesystem walker with symlink-cycle protection and ignored-directory filtering.
- `src/config.ts`: `.imgslimrc` reader/validator; merges home and cwd config into `ImgSlimConfig`.
- `src/utils.ts`: output-only helpers `formatBytes()` and `percentSaved()`.
