# Repository Atlas: imgslim

## Project Responsibility

`imgslim` is Node.js CLI package for image optimization workflows. It converts PNG/JPEG/SVG inputs to WebP, scans source code for local image references, and minifies PNG assets with safe output writes.

## System Entry Points

- `package.json`: npm package manifest; exposes `imgslim` binary at `dist/cli.js`; defines build/test/publish scripts.
- `tsconfig.json`: TypeScript compile contract; compiles `src/**/*` to CommonJS `dist/` with declarations and source maps.
- `src/cli.ts`: CLI runtime entrypoint; wires Commander commands, validates options, dispatches scan/convert/minify workflows.
- `src/optimizer.ts`: image-processing service layer; owns traversal, conversion, minification, concurrency, atomic writes, and stats aggregation.
- `src/source-scanner.ts`: source asset reference scanner; resolves local image paths from code/content files.
- `src/file-walker.ts`: shared filesystem traversal utility used by scanner and optimizer.
- `scripts/clean-dist.mjs`: cross-platform build cleanup script invoked by `npm run prebuild`.

## Root Assets

- `.github/workflows/`: CI/release automation outside runtime path.
- `dist/`: generated package output; ignored by codemap as build artifact.
- `scripts/`: build-support scripts; currently contains portable dist cleanup.
- `test/`: test fixtures and integration test; excluded from codemap state by design.
- `README.md`, `README_id.md`, `CHANGELOG.md`, `LICENSE`: package documentation and metadata; excluded from folder maps.
- `.slim/codemap.json`: codemap hash state for change detection.

## Repository Directory Map

| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/` | Implements CLI runtime, config loading, shared traversal, source scanning, WebP conversion, PNG minification, output formatting, and optimization stats flow. | [View Map](src/codemap.md) |

## Architecture Summary

- Presentation layer: `src/cli.ts` parses commands/options through Commander and renders terminal/JSON results, including structured JSON skipped entries.
- Configuration layer: `src/config.ts` merges home and local `.imgslimrc`; local config overrides home config while `--no-*` flags can override true booleans.
- Domain service layer: `src/optimizer.ts` executes conversion/minification through Sharp with bounded concurrency, max-input-pixel guards, deterministic aggregation, collision skips, and atomic writes.
- Discovery layer: `src/source-scanner.ts` walks source trees, extracts normal string, CSS `url()`, Markdown, and `srcset` image references, then resolves relative, asset-root, and alias paths.
- Traversal layer: `src/file-walker.ts` centralizes recursive file walking and symlink-cycle protection.
- Utility layer: `src/utils.ts` formats byte deltas and percentage savings for user-facing output.

## Data & Control Flow

1. User invokes `imgslim` binary from `dist/cli.js` generated from `src/cli.ts`.
2. `main()` loads config with `loadConfig()`, builds Commander command graph, and parses args.
3. `convert` and default paths call `optimize()` in convert mode.
4. `minify` calls `optimize()` in minify mode with suffix/out-dir/dry-run options.
5. `scan` calls `scanSourceCodeForImages()`, filters resolved image references with `isImageFile()`, then forwards convertible paths into `optimize()` unless dry-run.
6. `optimize()` discovers files through `walkMatchingFiles()`, filters output collisions, processes with `processPool()`, merges per-file stats in input order, and returns aggregate results.
7. CLI renders `printResults()`, summaries, or `buildJsonOutput()`; process exits non-zero on scan/optimization failures and keeps failure stderr visible under quiet mode.

## Integration Points

- npm package consumers call `imgslim` binary declared in `package.json`.
- `commander` supplies command routing and option parsing.
- `sharp` performs WebP conversion, metadata reads, and PNG recompression.
- Node built-ins (`fs`, `fs/promises`, `path`, `crypto`, `perf_hooks`, `os`) provide traversal, atomic file output, config lookup, temp names, and timing.
- Build pipeline uses portable `scripts/clean-dist.mjs` plus TypeScript `tsc` via `npm run build`; tests run built CLI through `npm test`.
- Publish workflow runs install, build, tests, `npm pack --dry-run`, and packed-package smoke test before `npm publish`.
