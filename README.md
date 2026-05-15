# ImgSlim

Convert images to WebP, minify PNG files, and scale images from the command line. Smaller files, simple CLI.

Four ways to use it:

1. **Direct conversion** — point it at images or folders, get `.webp` files.
2. **Source scan** — scan your code for image references, convert all found images.
3. **Minify** — compress PNG images, output `_min.png` alongside the original.
4. **Scale** — resize images, output `_scaled` alongside the original.

> For conversion: ImgSlim never deletes or modifies your original files. `photo.png` stays — you get `photo.webp` next to it.
> For minify: ImgSlim writes `_min.png` alongside the original. The original is never modified. Use `--overwrite` to replace an existing `_min.png`.
> For scale: ImgSlim writes `_scaled` output alongside the original. The original is never modified. Use `--overwrite` to replace existing scaled output.

---

## Supported Formats

Converts these to WebP:

- `.png`
- `.jpg` / `.jpeg`
- `.svg`

> **About SVG:** Sharp rasterizes SVG to PNG first, then encodes to WebP. The output is a bitmap — vector scalability is lost. Keep the original SVG if you need pure vector rendering.

Minifies these without changing format:

- `.png` only

JPG, SVG, and WebP inputs are skipped in `minify` mode for now.

Scales these without changing format:

- `.png`
- `.jpg` / `.jpeg`
- `.webp`

SVG inputs are skipped in `scale` mode for now.

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
imgslim convert photo.jpg            # explicit convert command
imgslim hero.png banner.jpg logo.svg # multiple files
imgslim ./images --recursive         # every image in the folder (and subfolders)
```

**Scan source code** — only converts images that are actually referenced in your code:

```bash
imgslim scan ./src --recursive
```

**Minify PNG files** — compress PNGs without changing format:

```bash
imgslim minify photo.png               # creates photo_min.png
imgslim minify photo.png --dry-run     # preview only
imgslim minify photo.png --suffix .opt # creates photo.opt.png
imgslim minify ./images --recursive    # minify all PNGs in folder
```

**Scale images** — resize while preserving original files:

```bash
imgslim scale photo.png --size 50%       # creates photo_scaled.png
imgslim scale photo.png --size 800x      # width 800px, aspect ratio kept
imgslim scale photo.png --size x600      # height 600px, aspect ratio kept
imgslim scale ./images --recursive --size 50%
```

Example: if `./images/` has `logo.png`, `hero.jpg`, and `draft.png` — but only `logo.png` and `hero.jpg` appear in your HTML/CSS/JS — scan mode converts only those two. Direct mode (`imgslim ./images`) converts all three.

---

## Usage

### Direct Conversion

Use when you know which images to convert.

```bash
imgslim <files or folders...>
imgslim convert <files or folders...>
```

The default command and `convert` do the same thing. The default form is kept for backward compatibility.

**Single file**

```bash
imgslim photo.jpg
imgslim convert photo.jpg
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

Scan also accepts WebP conversion options: `--quality`, `--lossless`, `--overwrite`, `--auto`, and `--recursive`.

---

### Minify

Compress PNG images, output a `_min.png` file alongside the original by default. The original is never modified.

```bash
imgslim minify photo.png
```

Result: `photo.png` stays, `photo_min.png` is created.

**Single file**

```bash
imgslim minify photo.png
```

**Multiple files**

```bash
imgslim minify a.png b.png
```

**Folder (recursive)**

```bash
imgslim minify ./images --recursive
imgslim minify -r ./images
```

**Custom suffix**

```bash
imgslim minify photo.png --suffix .optimized
# Result: photo.optimized.png

imgslim minify photo.png --suffix -small
# Result: photo-small.png
```

**Output to directory**

```bash
imgslim minify photo.png --out-dir ./dist
# Result: ./dist/photo_min.png
```

When multiple files with the same basename target the same `--out-dir` output, ImgSlim keeps the first and skips later collisions.

> **Supported formats:** PNG only. JPG, SVG, and WebP inputs are skipped.
>
> **Safety:** writes to a temp file first, compares size against original. The output file is written only if smaller. If not smaller, the temp file is deleted and no output is created.
>
> **Important:** PNG minify uses palette quantization (`palette: true`) by default. This can reduce colors to 256-color palette and strip metadata. Use `--lossless-only` to avoid palette quantization. Use Git/backup if originals matter. Animated PNGs and symlinks are skipped for safety.

**Minify options**

| Option | Description |
|---|---|
| `-r, --recursive` | Scan directories recursively |
| `--dry-run` | Preview what would be converted without writing files |
| `--suffix <suffix>` | Output suffix (default: `_min`) |
| `-o, --out-dir <dir>` | Output directory for minified PNG files |
| `--overwrite` | Replace existing output file (default: skip if exists) |
| `--lossless-only` | Skip palette quantization for lossless-like quality |

Suffix rules:

- Default suffix: `_min`
- Empty suffix is invalid
- Path separators (`/` or `\`) are invalid
- Files already ending with the active suffix are skipped to avoid `photo_min_min.png`

**Dry-run example**

```bash
imgslim minify photo.png --dry-run
# Would convert:
#   photo.png -> photo_min.png
```

**Lossless-only example**

```bash
imgslim minify photo.png --lossless-only
# Uses compression without palette quantization (lossless quality)
```

---

### Scale

Resize images, output a `_scaled` file alongside the original by default. The original is never modified.

```bash
imgslim scale photo.png --size 50%
```

Result: `photo.png` stays, `photo_scaled.png` is created.

**Size formats**

```bash
imgslim scale photo.png --size 50%     # 50% of width and height
imgslim scale photo.png --size 800x600 # fit inside 800×600, keep aspect ratio
imgslim scale photo.png --size 800x    # target width, keep aspect ratio
imgslim scale photo.png --size x600    # target height, keep aspect ratio
```

Percent values must be greater than `0` and less than `100`. Dimension values must be positive. ImgSlim does not upscale images.

**Folder (recursive)**

```bash
imgslim scale ./images --recursive --size 50%
```

**Custom suffix**

```bash
imgslim scale photo.png --size 50% --suffix _small
# Result: photo_small.png
```

**Output to directory**

```bash
imgslim scale photo.png --size 50% --out-dir ./dist
# Result: ./dist/photo_scaled.png
```

When multiple files with the same basename target the same `--out-dir` output, ImgSlim keeps the first and skips later collisions.

> **Supported formats:** PNG, JPG/JPEG, and WebP. SVG inputs are skipped.
>
> **Note:** Scaling writes same-format output and may recompress or strip metadata. Smaller dimensions do not guarantee smaller bytes for every image.

**Scale options**

| Option | Description |
|---|---|
| `--size <size>` | Required size: `50%`, `800x600`, `800x`, or `x600` |
| `-r, --recursive` | Scan directories recursively |
| `--dry-run` | Preview what would be scaled without writing files |
| `--suffix <suffix>` | Output suffix (default: `_scaled`) |
| `-o, --out-dir <dir>` | Output directory for scaled image files |
| `--overwrite` | Replace existing output file (default: skip if exists) |

Suffix rules match minify: non-empty, no path separators, and files already ending with the active suffix are skipped.

---

### Convert Options

These options apply to direct conversion, `convert`, and `scan`. Minify and scale have their own sets of options (see above). Scan mode also supports `--dry-run` and `--source-ext`.

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

> `--overwrite` only affects `.webp` outputs (convert/scan), `_min.png` outputs (minify), or `_scaled` outputs (scale). Original files are never modified.

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
  OK  src/assets/logo.png -> src/assets/logo_min.png  (18.5%, 5.2 KB)
  OK  src/assets/logo.png -> src/assets/logo_scaled.png  (25.0%, 7.0 KB)
```

| Status | Meaning |
|---|---|
| `OK` | Converted, minified, or scaled successfully |
| `SKIP` | Skipped — output exists, unsupported minify format, or no smaller candidate |
| `MISS` | Image referenced in source but file not found |
| `FAIL` | Error reading or converting |

Dry-run minify/scale shows planned writes without creating files:

```txt
Would convert:
  src/assets/logo.png -> src/assets/logo_min.png

Would scale:
  src/assets/logo.png -> src/assets/logo_scaled.png
```

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

Config currently applies to global output behavior and WebP conversion/scan defaults. Minify/scale-specific options (`suffix`, `lossless-only`, `size`, mode-specific `out-dir`) are CLI-only for now.

| Key | Type | Description |
|---|---|---|
| `quality` | number | WebP quality `0`–`100` |
| `outDir` | string | Default WebP output directory |
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

**Preview PNG minify**

```bash
imgslim minify ./images --recursive --dry-run
```

**Minify PNGs to a separate folder**

```bash
imgslim minify ./images --recursive --out-dir ./optimized
```

**Scale images to half size**

```bash
imgslim scale ./images --recursive --size 50%
```

**Lossless-style PNG minify**

```bash
imgslim minify ./images --recursive --lossless-only
```

**CI/CD pipeline**

```bash
imgslim ./images --recursive --json --quiet > report.json
```

---

## Things to Know

- **Conversion never deletes or modifies original files.** Only `.webp` files are created.
- **Minify creates `_min.png` alongside the original.** Original files are never modified.
- **Scale creates `_scaled` output alongside the original.** Original files are never modified.
- **Minify/scale with `--out-dir` flattens output names.** Duplicate basenames are skipped to prevent overwrites.
- **Minify default can be lossy.** Use `--lossless-only` to avoid palette quantization.
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
