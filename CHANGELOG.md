# Changelog

All notable changes to ImgSlim will be documented in this file.

## [1.0.1] — 2026-04-30

### Fixed
- **Critical: Recursive scan not working** — Commander v12 bug prevented boolean flags (`-r`, `--lossless`, `--overwrite`, `--auto`, `--json`, `--verbose`, `--quiet`) from being recognized on subcommands. All boolean flags moved to program-level options as workaround.
- **Symlink cycle detection** — `realpathSync` + `visited` Set prevents infinite recursion on symlink loops. Broken symlinks caught and skipped gracefully.
- **Auto mode nondeterministic** — Candidates sorted by quality descending before selection. Always picks highest quality first.
- **`--quiet` mode bleed** — Per-file SKIP/MISS/FAIL lines in scan mode now properly suppressed under `--quiet`.
- **JSON `summary.failed` undercount** — Scan mode JSON now includes `scan.failed` in the summary count.
- **Negative `totalBytesSaved`** — Clamped to positive-only when WebP output is larger than original.

### Added
- **`--json` flag** — Structured JSON output for CI/CD pipelines. Progress and warnings go to stderr, JSON to stdout.
- **`--dry-run` flag** — Preview what would be converted in scan mode without writing any files.
- **`--verbose` flag** — Per-file timing information (`[XXms]`) in output.
- **`--quiet` flag** — Suppress per-file output, show summary only.
- **`.imgslimrc` config file** — JSON config loaded from `~/.imgslimrc` (global) and `./.imgslimrc` (project). CLI flags always override.
- **Progress reporting** — `[1/5] file.jpg` progress indicator on stderr during scan and conversion.
- **Atomic writes** — Output written to random temporary file then renamed. Zero risk of corrupted `.webp` on crash.
- **Flag conflict validation** — Warnings when `--auto` is used with `--lossless` or explicit `--quality`.
- **Config validation** — `.imgslimrc` values validated for type and range; malformed configs emit warnings.
- **Semaphore concurrency pool** — Workers stay saturated instead of batch-wait. 4 concurrent file conversions.
- **Auto mode parallel quality testing** — 4 quality levels tested with concurrency=2. Significant speedup over sequential testing.

### Changed
- **Consistent extension detection** — `isImageFile` exported from optimizer, used everywhere via `path.extname`.
- **Result printing deduplicated** — `printResults()`, `parseQuality()`, `printSummary()` extracted from duplicated CLI code.
- **`totalBytesSaved` semantic** — Now clamped to positive-only. Per-file lines show `+X` for growth; summary reflects actual savings.
- **README rewritten in English** — Industry-standard documentation. Indonesian version in `README_id.md`.

### Development
- 26 integration tests (up from 0)
- `prepublishOnly` script for safe npm publish
- `engines` field: Node.js `>=18`
- `files` field for clean npm package (no source/test bloat)
- GitHub Actions workflow for auto-publish on release
- `prebuild` script cleans `dist/` before each build

## [1.0.0] — 2026-04-28

### Initial Release
- CLI tool for converting images to WebP using sharp
- Two modes: direct conversion and source code scan
- Supported input formats: PNG, JPG, JPEG, SVG
- WebP quality control (0–100, default 80)
- Lossless WebP support
- Auto mode with quality analysis (90, 80, 70, 60)
- Source code scanner (HTML, CSS, JS, TS, JSX, TSX, Vue, Svelte, Astro, MD, MDX)
- Local image reference detection via regex
- Common directory exclusion (node_modules, .git, dist, build, etc.)
- External URL and data URI filtering
