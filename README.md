# ImgSlim

Convert images to WebP from the command line. Smaller files, same quality.

Two ways to use it:

1. **Direct conversion** — point it at images or folders, get `.webp` files.
2. **Source scan** — scan your code for image references, convert all found images.

> ImgSlim never deletes or modifies your original files. `photo.png` stays — you get `photo.webp` next to it.

---

## Supported Formats

Converts these to WebP:

- `.png`
- `.jpg` / `.jpeg`
- `.svg`

> **About SVG:** Sharp rasterizes SVG to PNG first, then encodes to WebP. The output is a bitmap — vector scalability is lost. Keep the original SVG if you need pure vector rendering.

---

## Install

```bash
npm install -g imgslim
```

Node.js 18 or newer required.

Done. The `imgslim` command is now available everywhere:

```bash
imgslim --help
```

---

## Quick Start

**Convert specific images** — point at files or folders, every supported image gets converted:

```bash
imgslim photo.jpg                    # single file → photo.webp
imgslim hero.png banner.jpg logo.svg # multiple files
imgslim ./images --recursive         # every image in the folder (and subfolders)
```

**Scan source code** — only converts images that are actually referenced in your code:

```bash
imgslim scan ./src --recursive
```

Example: if `./images/` has `logo.png`, `hero.jpg`, and `draft.png` — but only `logo.png` and `hero.jpg` appear in your HTML/CSS/JS — scan mode converts only those two. Direct mode (`imgslim ./images`) converts all three.

---

## Usage

### Direct Conversion

Use when you know which images to convert.

```bash
imgslim <files or folders...>
```

**Single file**

```bash
imgslim photo.jpg
```

**Multiple files**

```bash
imgslim a.jpg b.png c.svg
```

**Folder (top-level only)**

```bash
imgslim ./images
```

**Folder (recursive)**

```bash
imgslim ./images --recursive
imgslim -r ./images
```

**Output to different folder**

```bash
imgslim photo.png --out-dir ./webp
imgslim -o ./webp photo.png
```

Result: `./webp/photo.webp`

---

### Source Scan

Scan source code for local image references, then convert the found images.

```bash
imgslim scan <source files or folders...>
```

**Example**

```bash
imgslim scan ./src --recursive
```

**How it works**

1. Reads your source files (HTML, CSS, JS, TS, etc.)
2. Finds local image references (e.g. `"./logo.png"`, `url("../bg.jpg")`, `![Alt](./img.png)`)
3. Resolves references to actual files
4. Converts each found image to `.webp` right next to the original
5. Reports what happened

**Supported reference patterns**

```html
<!-- HTML -->
<img src="./assets/logo.png" />
```

```css
/* CSS */
.hero { background-image: url("../images/hero.jpg"); }
```

```ts
// JavaScript / TypeScript
import logo from "./assets/logo.png";
const image = "../images/banner.jpg";
```

```md
<!-- Markdown / MDX -->
![Logo](./assets/logo.png)
```

**What it ignores**
- Remote URLs (`https://...`)
- Data URIs (`data:...`)
- Dynamic expressions (`` `./img${n}.png` ``)

**Default source file extensions**

`.html` `.htm` `.css` `.scss` `.sass` `.less` `.js` `.jsx` `.ts` `.tsx` `.vue` `.svelte` `.astro` `.md` `.mdx`

**Scan-specific options**

| Option | Description |
|---|---|
| `--dry-run` | Preview what would be converted without writing files |
| `--source-ext <exts>` | Only scan specific extensions (e.g. `ts,tsx,css`) |

---

### Shared Options

All options work in both modes. Scan mode also supports its own `--dry-run` and `--source-ext`.

**Quality** (default: `80`)

```bash
imgslim photo.jpg --quality 90
imgslim -q 90 photo.jpg
```

**Lossless**

```bash
imgslim photo.png --lossless
```

**Auto mode** — tests multiple settings, picks the best result. Skips files if WebP isn't smaller.

```bash
imgslim photo.png --auto
```

> Combining `--auto` with `--quality` or `--lossless` gives a warning — auto mode picks its own settings.

**Overwrite** — replace existing `.webp` files. By default, existing outputs are skipped.

```bash
imgslim photo.png --overwrite
```

> `--overwrite` only affects `.webp` outputs. Original files are never touched.

**Recursive** — scan folders recursively.

```bash
imgslim ./images --recursive
imgslim scan ./src --recursive
```

---

## CLI Output

### Per-file status

```
  OK  src/assets/logo.png -> src/assets/logo.webp  (42.1%, 18.4 KB) [q90]
```

| Status | Meaning |
|---|---|
| `OK` | Converted successfully |
| `SKIP` | Skipped — output exists, or auto mode found no benefit |
| `MISS` | Image referenced in source but file not found |
| `FAIL` | Error reading or converting |

### Summary

After conversion, you get a summary:

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

### Quiet mode

Hide per-file output, show summary only:

```bash
imgslim ./images --recursive --quiet
```

### Verbose mode

Show timing for each file:

```bash
imgslim ./images --verbose
```

```
  OK  images/hero.png -> images/hero.webp  (74.4%, 35.0 KB) [128ms]
```

### JSON output

Machine-readable for scripts and CI/CD:

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

Scan mode JSON adds scan details:

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

> JSON output goes to stdout. Progress and warnings go to stderr — safe to pipe: `imgslim ... --json > report.json`

---

## Configuration File

Create an `.imgslimrc` file to set defaults. Place it in:

1. `~/.imgslimrc` — global defaults (applies everywhere)
2. `./.imgslimrc` — project defaults (overrides global)

CLI flags always override config values.

**Example**

```json
{
  "quality": 85,
  "auto": true,
  "recursive": true,
  "sourceExt": "ts,tsx,css,html",
  "verbose": false,
  "quiet": false
}
```

**All available keys**

| Key | Type | Description |
|---|---|---|
| `quality` | number | WebP quality `0`–`100` |
| `outDir` | string | Default output directory |
| `recursive` | boolean | Always scan directories recursively |
| `lossless` | boolean | Use lossless WebP |
| `overwrite` | boolean | Always overwrite existing `.webp` |
| `auto` | boolean | Always use auto mode |
| `sourceExt` | string | Default source extensions (comma-separated) |
| `verbose` | boolean | Always show per-file timing |
| `quiet` | boolean | Always show summary only |
| `json` | boolean | Always output JSON |

---

## Common Workflows

**Frontend project — scan and convert all images**

```bash
imgslim scan ./src ./public --recursive --auto
```

**Convert an asset folder**

```bash
imgslim ./assets --recursive --auto
```

**High-quality conversion**

```bash
imgslim ./images --recursive --quality 90
```

**Regenerate all WebP files**

```bash
imgslim ./images --recursive --overwrite
```

**CI/CD pipeline**

```bash
imgslim ./images --recursive --json --quiet > report.json
```

---

## Things to Know

- **Original files are never deleted or modified.** Only `.webp` files are created.
- **Source code files are never modified.** The scan command only reads them.
- **Scan mode only detects plain string references.** Dynamic expressions like `` `./img${n}.png` `` are not found.
- **Remote URLs** (`https://...`) and **data URIs** (`data:...`) are ignored.
- **Directories skipped** during source scan: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt`.
- **Atomic writes.** Files are written to a temp path then renamed — no risk of corrupted output if the process crashes.
- **Existing `.webp` files are skipped** by default. Use `--overwrite` to regenerate them.

---

- [Changelog](CHANGELOG.md)
- [npm package](https://www.npmjs.com/package/imgslim)
- [GitHub](https://github.com/mizu-pras/imgslim)
