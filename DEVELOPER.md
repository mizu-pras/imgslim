# Developer Documentation

## Project Overview

ImgSlim is a CLI tool that converts images (PNG, JPG, JPEG, SVG) to WebP format using [sharp](https://sharp.pixelplumbing.com/). Two operation modes: **direct conversion** (explicit file/directory inputs) and **source scan** (discovers image references in source code, then converts found images).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥18 |
| Language | TypeScript (strict mode) |
| Module system | **CommonJS** (compiled output) |
| CLI framework | [Commander v12](https://github.com/tj/commander.js) |
| Image processing | [sharp v0.33](https://sharp.pixelplumbing.com/) |
| Testing | `node:test` + `node:assert` (built-in, no deps) |
| Build | `tsc` (TypeScript compiler) |

---

## Source Structure

```
src/
├── cli.ts             # Entry point: CLI definition, command routing, output formatting
├── config.ts          # .imgslimrc config file loading and validation
├── optimizer.ts       # Core image conversion engine
├── source-scanner.ts  # Source code scanner for image reference discovery
└── utils.ts           # Shared formatting utilities (bytes, percentages)
```

---

## Module Breakdown

### `cli.ts` — Entry Point & CLI Layer

**Role:** Command-line interface definition and orchestration.

- Defines global flags via Commander (`--json`, `--verbose`, `--quiet`, `--lossless`, `--overwrite`, `--auto`, `-r/--recursive`)
- **`scan` subcommand:** Scans source code → finds images → converts them
- **Default command:** Direct file/directory conversion
- Output helpers: `printResults()`, `printSummary()`, `printScanSummary()`, `buildJsonOutput()`
- Flag validation: `validateFlags()` warns on conflicting options (`--auto` + `--lossless`, etc.)

**Commander v12 workaround:** Boolean flags cannot be defined on subcommands due to a Commander v12 parsing bug. All boolean flags are defined at program level and accessed via `program.opts<>()`.

**Output routing:**
- `--json` → structured JSON to stdout, progress/warnings to stderr
- `--quiet` → summary-only, no per-file output
- `--verbose` → per-file timing (`[XXms]`)
- Default → per-file OK/SKIP/MISS/FAIL lines + summary

### `config.ts` — Configuration Layer

**Role:** Load and validate `.imgslimrc` JSON config files.

- **Two-tier merge:** `~/.imgslimrc` (global) → `./.imgslimrc` (project), local overrides home
- **Validation:** Type-checks each key (number range, string type, boolean type). Unknown keys silently ignored.
- **Invalid values** emit warnings to stderr, defaulted away
- **Parse errors** (malformed JSON) emit warnings, fall back to empty config

Exported interface:
```ts
interface ImgSlimConfig {
  quality?: number;      // 0–100
  outDir?: string;
  recursive?: boolean;
  lossless?: boolean;
  overwrite?: boolean;
  auto?: boolean;
  sourceExt?: string;    // comma-separated
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
}
```

### `optimizer.ts` — Conversion Engine

**Role:** Discover image files on disk and convert them to WebP.

#### Key functions

| Function | Purpose |
|---|---|
| `isImageFile(path)` | Checks if path has supported extension (`.png`, `.jpg`, `.jpeg`, `.svg`) |
| `findImageFiles(path, recursive)` | Recursively collects image files from a path. Handles symlink cycle detection via `realpathSync` + `visited` Set |
| `resolveOutputPath(input, outDir?)` | Maps input path → output `.webp` path |
| `convertFile(input, options, stats)` | Single-file conversion entry. Handles skip-if-exists, auto mode branching |
| `analyzeAndConvert(input, options, output, size, stats)` | Auto mode: tests quality levels `[90, 80, 70, 60]`, picks best candidate |
| `processPool(items, concurrency, fn)` | Generic concurrency pool (semaphore pattern), workers stay saturated |
| `optimize(inputs, options)` | Main entry: collects files → converts with 4-way concurrency |

#### Conversion paths

1. **`--lossless` mode:** Single pass with `lossless: true`. Skips if output ≥ input.
2. **`--auto` mode:** Tests 4 quality levels (90, 80, 70, 60) at concurrency=2. Selection strategy:
   - Primary: highest quality with ≥10% size reduction
   - Fallback: smallest candidate still smaller than original
   - Otherwise: skip (no benefit)
3. **Default mode:** Single pass at specified quality (default 80).

#### Atomic writes

Output is written to a random temp file (`<output>.<hex>.tmp`) then renamed. Prevents corrupted files on crash.

#### Concurrency

- File conversion: `processPool(files, 4, ...)` — 4 parallel sharp calls
- Auto mode quality testing: `processPool(qualities, 2, ...)` — 2 parallel quality tests

### `source-scanner.ts` — Source Code Scanner

**Role:** Scan source files for local image references, resolve paths, return list of image files to convert.

#### Image reference detection

Single unified regex (`IMAGE_REFERENCE_RE`) matches:
- `url()` references in CSS: `url("../images/hero.jpg")`
- String references in JS/TS/HTML/Markdown: `"./assets/logo.png"`, `'./assets/logo.png'`

Patterns **not** detected:
- Dynamic expressions (template literals, string concatenation): `` `./img${n}.png` ``
- Remote URLs (`https://...`) — filtered by `isExternalReference()`
- Data URIs (`data:...`) — filtered by `isExternalReference()`

#### Default source extensions

`.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.md`, `.mdx`

Custom extensions via `--source-ext ts,tsx,css`.

#### Ignored directories

`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt` — skipped during directory scan.

#### Path resolution

- Relative references resolved from source file directory via `resolve(dirname(sourceFile), reference)`
- Absolute references tried from CWD first, then as-is

#### Key functions

| Function | Purpose |
|---|---|
| `collectSourceFiles(input, options, extensions)` | Recursively collects source files. Handles symlink cycles. |
| `resolveReference(sourceFile, reference)` | Resolves a reference string to absolute file path |
| `scanSourceCodeForImages(inputs, options)` | Main entry: collects source files → reads each → extracts refs → resolves paths |

### `utils.ts` — Utilities

```ts
formatBytes(bytes: number): string    // "42.1 KB", "1.2 MB"
percentSaved(inputSize, outputSize): string  // "74.4%"
```

---

## Data Flow

### Direct Conversion Flow

```
User input (files/dirs)
  → findImageFiles()      — collect all image files, resolve symlinks
    → processPool(files, 4)
      → convertFile()     — per file
        → lossless path (single pass)
        → auto path (test 4 qualities, pick best)
        → default path (single pass at quality)
  → OptimizerStats returned
    → printResults() / buildJsonOutput() / printSummary()
```

### Source Scan Flow

```
User input (source files/dirs)
  → scanSourceCodeForImages()
    → collectSourceFiles()  — find all source files
    → per source file:
      → readFile() → IMAGE_REFERENCE_RE → extract references
      → resolveReference() → check existsSync()
  → SourceScanResult (images list)
    → filter convertible (isImageFile)
    → optimize(convertibleImages, ...)
  → printResults + printScanSummary / buildJsonOutput
```

---

## Key Interfaces

```ts
// optimizer.ts
interface OptimizerOptions {
  outDir?: string;
  quality: number;
  lossless: boolean;
  recursive: boolean;
  overwrite: boolean;
  auto: boolean;
  onProgress?: (file: string, current: number, total: number) => void;
}

interface ConversionResult {
  input: string;
  output: string;
  inputSize: number;
  outputSize: number;
  quality?: number;        // present only in auto/lossless modes
}

interface OptimizerStats {
  converted: ConversionResult[];
  skipped: string[];       // output exists (no --overwrite)
  autoSkipped: AutoSkipResult[];  // auto mode: no smaller candidate
  failed: { path: string; error: string }[];
  totalBytesSaved: number;  // clamped to positive-only
}

// source-scanner.ts
interface ScanOptions {
  recursive: boolean;
  sourceExtensions?: string[];
  onProgress?: (file: string, current: number, total: number) => void;
}

interface SourceScanResult {
  sourceFiles: number;
  images: string[];
  unresolved: { source: string; reference: string }[];
  failed: { path: string; error: string }[];
}
```

---

## Build System

```bash
npm run build       # tsc — compiles src/ → dist/
npm run prebuild    # rm -rf dist (runs automatically before build)
npm run start       # node dist/cli.js
```

**TypeScript config** (`tsconfig.json`):
- Target: ES2022
- Module: CommonJS
- Output: `dist/` with declarations (`declaration: true`), declaration maps, source maps
- Strict mode enabled

**npm package** (`package.json`):
- `bin.imgslim` → `dist/cli.js`
- `files[]` includes only `dist/`, `README.md`, `README_id.md`, `CHANGELOG.md` — source/test excluded
- `engines`: Node.js ≥18
- `prepublishOnly`: auto-builds before publish

---

## Testing

### Framework

Uses **Node.js built-in test runner** (`node:test` + `node:assert`) — zero external test dependencies.

```bash
node test/imgslim.test.mjs
```

### Test structure

- 26 integration tests
- Each test operates in isolated temp directories under `test/test/tmp/`
- Test fixtures: 8 PNG images in `test/` directory
- Auto-cleanup: `after()` hook removes `TMP_ROOT`

### Test categories

Tests cover:
- Basic single-file conversion
- Multi-file conversion
- Directory conversion (non-recursive and recursive)
- `--out-dir` option
- `--quality` and `--lossless` flags
- `--auto` mode
- `--overwrite` flag
- `--dry-run` mode
- `--json` output
- `--verbose` and `--quiet` flags
- Source scan with various source extensions
- Symlink cycle detection
- Config file loading

### Adding tests

1. Add test image to `test/` if needed
2. Create isolated directory: `setupDir("test-name", ["0.png"])`
3. Run CLI: `run(["-r", dir])`
4. Assert: `assert.equal(result.exitCode, 0)`
5. Verify output exists with expected properties

---

## Publishing & Release

### Manual release

```bash
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0
git push origin master --follow-tags
```

Then create GitHub Release from newly pushed `vX.Y.Z` tag. Never run `npm publish` locally.

### Automated publish (CI/CD)

1. Publishing GitHub Release triggers publish workflow
2. Workflow verifies release tag equals `package.json` version
3. Workflow runs `npm ci → npm run build → npm test → npm pack --dry-run → packed-package smoke test → npm publish`

### Retry failed publish

Open **Actions → Publish to npm → Run workflow**, enter existing release tag (for example `v1.0.4`), then run. Workflow checks out that tag before publishing.

**Secrets needed:** `NPM_TOKEN` in GitHub repo → Settings → Secrets → Actions.

### Commit convention

```
feat: add --json output flag        # → minor bump
fix: symlink cycle causes crash      # → patch bump
feat!: drop Node 16 support          # → major bump
chore: update dependencies           # → no bump
docs: update README                  # → no bump
```

---

## Project Naming Conventions

| Convention | Pattern |
|---|---|
| Files | `kebab-case.ts` |
| Functions | `camelCase()` |
| Interfaces | `PascalCase` (no `I` prefix) |
| Exports | Named exports only, no default exports |
| Constants | `UPPER_SNAKE_CASE` or `SCREAMING_SNAKE_CASE` |
| CLI flags | `--flag-name`, `-f` shorthand |
| Error messages | Start with `Warning:` or `Error:` |

---

## Design Decisions

### Why CommonJS instead of ESM?

Sharp's ESM support has known issues with certain Node versions. CommonJS ensures maximum compatibility. The TypeScript source uses ESM-style imports (`import ... from`), compiled to `require()` calls.

### Why `processPool` instead of `Promise.all`?

`processPool` uses a semaphore pattern — workers pull next item when done, keeping pool saturated. `Promise.all` on chunks would create idle time gaps between batches.

### Why `totalBytesSaved` is clamped positive?

If WebP output is larger than original (possible for already-optimized or very small images), per-file lines show `+X` growth. But the summary reports actual savings only. This prevents misleading "saved -5 KB" summaries.

### Why commander v12 boolean workaround?

Commander v12 has a parsing bug where `--boolean-flag` defined on a subcommand is not recognized. Moving boolean flags to program level with `--no-` variants is the known workaround. The `--no-` prefix auto-creates the negated flag (e.g., `--no-recursive` for default `true`).

### Why regex-based scanning instead of AST parsing?

Regex covers the practical cases (string literals in HTML/JS/CSS/MD) without adding expensive parser dependencies. The trade-off is that dynamic expressions are not detected — documented as a known limitation. For most projects, static string references cover 95%+ of image usage.
