# ImgSlim

CLI tool for converting images to WebP format using [sharp](https://sharp.pixelplumbing.com/).

Two core modes:

1. **Direct conversion** — convert image files/folders to WebP.
2. **Source scan** — scan source code for local image references, then convert found images to WebP.

> **Note:** ImgSlim never deletes original files. Converting `photo.png` produces `photo.webp` alongside the existing `photo.png`.

---

## Supported Formats

Input formats convertible to WebP:

- `.png`
- `.jpg`
- `.jpeg`
- `.svg`

Output is always `.webp`.

> **SVG note:** Sharp rasterizes SVG to PNG before encoding to WebP. The result is a `.webp` bitmap — vector scalability is lost. Consider this when using `.svg` as a pure vector asset.

---

## Installation

```bash
npm install
npm run build
```

After build, the binary is at `dist/cli.js`. When installed as a global package, the `imgslim` command becomes available.

Run directly from the repository:

```bash
node dist/cli.js --help
```

---

## Quick Start

Convert a single image:

```bash
imgslim photo.png
```

Output:

```txt
photo.png -> photo.webp
```

Scan source code and convert referenced images:

```bash
imgslim scan ./src --recursive
```

Given source code containing:

```html
<img src="./assets/logo.png" />
```

ImgSlim creates `./src/assets/logo.webp` while leaving `./src/assets/logo.png` untouched.

---

## Mode 1: Direct Conversion

Use this mode when you already know which image files or folders to convert.

### Single File

```bash
imgslim photo.png
```

Output is created in the same directory: `photo.webp`

### Multiple Files

```bash
imgslim image1.jpg image2.png banner.svg
```

### Convert All Images in a Directory

Non-recursive (top-level only):

```bash
imgslim ./images
```

Recursive (includes subdirectories):

```bash
imgslim ./images --recursive
# or
imgslim -r ./images
```

### Output Directory

```bash
imgslim photo.png --out-dir ./webp
# or
imgslim -o ./webp photo.png
```

Result: `./webp/photo.webp`

### WebP Quality

Default quality is `80`. Valid range: `0`–`100`.

```bash
imgslim photo.png --quality 90
# or
imgslim -q 90 photo.png
```

### Lossless WebP

```bash
imgslim photo.png --lossless
```

### Auto Mode

Tests multiple WebP settings and picks the optimal result. Skips files if no WebP candidate is smaller than the original.

```bash
imgslim photo.png --auto
```

> **Note:** Using `--auto` with `--lossless` or explicit `--quality` will trigger a warning — auto mode uses its own quality selection strategy.

### Overwrite Existing WebP

By default, existing `.webp` output files are skipped. Use `--overwrite` to replace them:

```bash
imgslim photo.png --overwrite
```

> `--overwrite` only replaces `.webp` output. Original files (`.png`, `.jpg`, etc.) are never touched.

---

## Mode 2: Source Scan

Scan source code to discover local image references, then convert the found images to WebP.

```bash
imgslim scan <source...>
```

Example:

```bash
imgslim scan ./src --recursive
```

### How It Works

1. Reads source files.
2. Finds local image references (e.g. `./logo.png`, `../assets/photo.jpg`, `url("./bg.png")`).
3. Resolves references to actual files on disk.
4. Converts found images to `.webp` at the same location.
5. Reports converted, skipped, unresolved, and failed items.

### Detected Reference Patterns

**HTML:**

```html
<img src="./assets/logo.png" />
```

**CSS:**

```css
.hero {
  background-image: url("../images/hero.jpg");
}
```

**JavaScript / TypeScript:**

```ts
import logo from "./assets/logo.png";
const image = "../images/banner.jpg";
```

**Markdown / MDX:**

```md
![Logo](./assets/logo.png)
```

### Default Source Extensions

Scan reads files with these extensions by default:

`.html` `.htm` `.css` `.scss` `.sass` `.less` `.js` `.jsx` `.ts` `.tsx` `.vue` `.svelte` `.astro` `.md` `.mdx`

### Scan Options

| Option | Description |
|---|---|
| `<source...>` | One or more source files or directories |
| `-q, --quality <number>` | WebP quality `0`–`100` (default: `80`) |
| `-r, --recursive` | Recursively scan directories |
| `--lossless` | Use lossless WebP compression |
| `--overwrite` | Replace existing `.webp` output files |
| `--auto` | Auto-select optimal WebP settings |
| `--dry-run` | Preview what would be converted without writing files |
| `--source-ext <exts>` | Comma-separated source extensions to scan (e.g. `ts,tsx,css`) |
| `--json` | Output results as structured JSON |
| `--verbose` | Show timing details per file |
| `--quiet` | Show summary only, suppress per-file output |

### Dry Run

Preview which images would be converted without actually writing any files:

```bash
imgslim scan ./src --recursive --dry-run
```

### Filter by Source Extension

```bash
imgslim scan ./src --recursive --source-ext ts,tsx,css
```

### Auto Mode with Scan

```bash
imgslim scan ./src --recursive --auto
```

---

## CLI Output

### Per-File Status

```
  OK  src/assets/logo.png -> src/assets/logo.webp  (42.1%, 18.4 KB) [q90]
```

| Status | Meaning |
|---|---|
| `OK` | Successfully converted to WebP |
| `SKIP` | Skipped — output already exists, or auto mode found no smaller candidate |
| `MISS` | Image referenced in source but not found on disk |
| `FAIL` | Error reading or converting the file |

### Summary

```
──────────────────────────────────────────
  Source files : 12
  Images found : 5
  Convertible  : 5
  Converted    : 4
  Skipped      : 1
  Unresolved   : 0
  Failed       : 0
  Bytes saved  : 124.8 KB (37.5%)
──────────────────────────────────────────
```

---

## Output Formats

### JSON Output (CI/CD)

Use `--json` for machine-readable output. Prints a structured JSON object to stdout (progress and warnings go to stderr).

```bash
imgslim ./images --recursive --json
```

```json
{
  "converted": [
    {
      "input": "images/hero.png",
      "output": "images/hero.webp",
      "inputSize": 48200,
      "outputSize": 12350,
      "quality": 90
    }
  ],
  "skipped": [],
  "autoSkipped": [],
  "failed": [],
  "summary": {
    "converted": 1,
    "skipped": 0,
    "failed": 0,
    "bytesSaved": 35850,
    "percentSaved": "74.4%"
  }
}
```

Scan mode JSON includes additional `scan` fields:

```bash
imgslim scan ./src --recursive --json
```

```json
{
  "converted": [...],
  "summary": {...},
  "scan": {
    "sourceFiles": 12,
    "imagesFound": 5,
    "unresolved": [],
    "scanFailed": []
  }
}
```

### Verbose Mode

Adds per-file timing information:

```bash
imgslim ./images --verbose
```

```
  OK  images/hero.png -> images/hero.webp  (74.4%, 35.0 KB) [128ms]
```

### Quiet Mode

Suppresses per-file output, showing only the summary:

```bash
imgslim ./images --recursive --quiet
```

---

## Configuration File

ImgSlim supports an optional `.imgslimrc` JSON config file. It is loaded from two locations (merged — local overrides home):

1. `~/.imgslimrc` (home directory — global defaults)
2. `./.imgslimrc` (current directory — project defaults)

CLI flags always override config values.

### Example `.imgslimrc`

```json
{
  "quality": 85,
  "auto": true,
  "overwrite": false,
  "recursive": true,
  "sourceExt": "ts,tsx,css,html",
  "verbose": false,
  "json": false,
  "quiet": false
}
```

| Key | Type | Description |
|---|---|---|
| `quality` | number | WebP quality `0`–`100` |
| `outDir` | string | Default output directory |
| `recursive` | boolean | Always scan directories recursively |
| `lossless` | boolean | Use lossless WebP |
| `overwrite` | boolean | Always overwrite existing `.webp` |
| `auto` | boolean | Always use auto mode |
| `sourceExt` | string | Default source extensions (comma-separated) |
| `verbose` | boolean | Always show timing details |
| `quiet` | boolean | Always suppress per-file output |
| `json` | boolean | Always output JSON |

---

## Important Behaviors

- ImgSlim creates `.webp` files alongside originals — original files are **never** deleted or modified.
- Source code files are **never** modified. The scan mode only reads them to discover image references.
- Scan mode detects only local image references written as plain strings / path literals. Dynamic expressions (e.g. `` `./img${n}.png` ``) are not detected.
- Remote URLs (`https://...`) and data URIs (`data:...`) are ignored.
- Common directories are excluded during source scanning: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt`.
- If the output `.webp` already exists, use `--overwrite` to regenerate it.
- Atomic writes: files are written to a temporary path then renamed — no risk of corrupted output on crash.

---

## Common Workflows

### Frontend / Web Project

```bash
npm run build
imgslim scan ./src ./public --recursive --auto
```

### Asset Directory Only

```bash
imgslim ./assets --recursive --auto
```

### High Quality Conversion

```bash
imgslim ./images --recursive --quality 90
```

### Force Overwrite

```bash
imgslim ./images --recursive --overwrite
```

### CI/CD Pipeline

```bash
imgslim ./images --recursive --json --quiet > report.json
```

---

## Development

Build TypeScript:

```bash
npm run build
```

Run CLI locally:

```bash
node dist/cli.js --help
node dist/cli.js scan --help
```

Run tests:

```bash
node test/imgslim.test.mjs
```
