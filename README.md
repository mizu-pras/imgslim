# ImgSlim

ImgSlim adalah CLI tool untuk mengubah image ke format WebP menggunakan [sharp](https://sharp.pixelplumbing.com/).

Tool ini punya 2 mode utama:

1. **Convert image langsung** — input berupa file/folder image.
2. **Scan source code** — input berupa file/folder source code, lalu ImgSlim mencari referensi image lokal dan mengubah image yang ditemukan ke WebP.

> Catatan: ImgSlim tidak menghapus file original. Jika `photo.png` dikonversi, hasilnya menjadi `photo.webp` dan `photo.png` tetap ada.

## Format yang Didukung

Input yang bisa dikonversi ke WebP:

- `.png`
- `.jpg`
- `.jpeg`
- `.svg`

Output selalu berupa `.webp`.

> **Catatan SVG**: Sharp melakukan rasterisasi SVG menjadi PNG terlebih dahulu sebelum dikonversi ke WebP. Hasilnya tetap `.webp`, namun gambar vektor akan menjadi raster (bitmap) dan bisa kehilangan skalabilitas. Pertimbangkan ini jika Anda menggunakan `.svg` sebagai aset vektor murni.

## Instalasi

```bash
npm install
npm run build
```

Setelah build, binary tersedia di:

```bash
dist/cli.js
```

Jika package dipasang sebagai executable, command yang digunakan adalah:

```bash
imgslim
```

Untuk menjalankan langsung dari repository:

```bash
node dist/cli.js --help
```

## Quick Start

Convert satu image:

```bash
imgslim photo.png
```

Hasil:

```txt
photo.png -> photo.webp
```

Scan source code dan convert image yang direferensikan:

```bash
imgslim scan ./src --recursive
```

Contoh jika source code berisi:

```html
<img src="./assets/logo.png" />
```

ImgSlim akan membuat:

```txt
./src/assets/logo.webp
```

File original tetap ada:

```txt
./src/assets/logo.png
```

## Mode 1: Convert Image Langsung

Gunakan mode ini jika Anda sudah tahu file/folder image yang ingin dikonversi.

### Convert Satu File

```bash
imgslim photo.png
```

Output dibuat di folder yang sama:

```txt
photo.webp
```

### Convert Banyak File

```bash
imgslim image1.jpg image2.png banner.svg
```

### Convert Semua Image dalam Folder

Tanpa recursive, ImgSlim hanya membaca file image langsung di folder tersebut:

```bash
imgslim ./images
```

Dengan recursive, ImgSlim juga membaca subfolder:

```bash
imgslim ./images --recursive
```

atau:

```bash
imgslim -r ./images
```

### Simpan Output ke Folder Khusus

```bash
imgslim photo.png --out-dir ./webp
```

atau:

```bash
imgslim -o ./webp photo.png
```

Hasil:

```txt
./webp/photo.webp
```

### Atur Quality WebP

Default quality adalah `80`.

```bash
imgslim photo.png --quality 90
```

atau:

```bash
imgslim -q 90 photo.png
```

Nilai valid: `0` sampai `100`.

### Lossless WebP

Gunakan lossless jika ingin menghindari penurunan kualitas visual:

```bash
imgslim photo.png --lossless
```

### Auto Mode

Auto mode mencoba beberapa setting dan memilih hasil yang lebih optimal.

```bash
imgslim photo.png --auto
```

Dengan lossless:

```bash
imgslim photo.png --auto --lossless
```

Pada auto mode, ImgSlim bisa melewati file jika hasil WebP tidak lebih kecil dari original.

### Overwrite Output WebP yang Sudah Ada

Secara default, jika output `.webp` sudah ada, ImgSlim akan skip file tersebut.

Gunakan `--overwrite` untuk mengganti file `.webp` yang sudah ada:

```bash
imgslim photo.png --overwrite
```

> `--overwrite` hanya mengganti output `.webp`, bukan file original seperti `.png` atau `.jpg`.

## Mode 2: Scan Source Code lalu Convert Image ke WebP

Gunakan mode ini jika Anda ingin ImgSlim mengecek source code, menemukan image lokal yang direferensikan, lalu mengubah image tersebut ke WebP.

```bash
imgslim scan <source...>
```

Contoh:

```bash
imgslim scan ./src --recursive
```

Alur kerja mode `scan`:

1. Membaca file source code.
2. Mencari referensi image lokal seperti `./logo.png`, `../assets/photo.jpg`, atau `url("./bg.png")`.
3. Memastikan file image tersebut ada di filesystem.
4. Mengonversi image ke `.webp` di lokasi yang sama.
5. Menampilkan hasil convert, skip, unresolved, dan failed.

### Contoh Referensi yang Terdeteksi

HTML:

```html
<img src="./assets/logo.png" />
```

CSS:

```css
.hero {
  background-image: url("../images/hero.jpg");
}
```

JavaScript/TypeScript:

```ts
import logo from "./assets/logo.png";

const image = "../images/banner.jpg";
```

Markdown/MDX:

```md
![Logo](./assets/logo.png)
```

### Source Extension Default

Secara default, `scan` membaca file dengan extension berikut:

- `.html`
- `.htm`
- `.css`
- `.scss`
- `.sass`
- `.less`
- `.js`
- `.jsx`
- `.ts`
- `.tsx`
- `.vue`
- `.svelte`
- `.astro`
- `.md`
- `.mdx`

### Scan Recursive

```bash
imgslim scan ./src --recursive
```

atau:

```bash
imgslim scan ./src -r
```

### Scan Beberapa Folder/File

```bash
imgslim scan ./src ./components ./pages/index.html --recursive
```

### Batasi Extension Source Code

Gunakan `--source-ext` jika hanya ingin membaca extension tertentu:

```bash
imgslim scan ./src --recursive --source-ext ts,tsx,css
```

### Quality pada Scan Mode

```bash
imgslim scan ./src --recursive --quality 85
```

### Auto Mode pada Scan Mode

```bash
imgslim scan ./src --recursive --auto
```

### Overwrite Output WebP pada Scan Mode

Jika `logo.webp` sudah ada, ImgSlim akan skip secara default.

Gunakan:

```bash
imgslim scan ./src --recursive --overwrite
```

> File original seperti `logo.png` tetap tidak dihapus dan tidak ditimpa.

## Output CLI

Contoh output convert berhasil:

```txt
  OK  src/assets/logo.png -> src/assets/logo.webp  (42.1%, 18.4 KB)
```

Arti status:

| Status | Arti |
|---|---|
| `OK` | File berhasil dikonversi ke WebP |
| `SKIP` | File dilewati, misalnya output sudah ada atau hasil auto tidak lebih kecil |
| `MISS` | Referensi image ditemukan di source code, tapi file tidak ditemukan di filesystem |
| `FAIL` | Terjadi error saat membaca/mengonversi file |

Contoh ringkasan:

```txt
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

## Command Reference

### `imgslim <input...>`

Convert image file/folder langsung ke WebP.

```bash
imgslim [options] <input...>
```

Options:

| Option | Deskripsi |
|---|---|
| `<input...>` | Satu atau lebih file/folder image |
| `-o, --out-dir <dir>` | Folder output. Default: di sebelah file input |
| `-q, --quality <number>` | Quality WebP `0-100`. Default: `80` |
| `-r, --recursive` | Scan folder secara recursive |
| `--lossless` | Gunakan WebP lossless |
| `--overwrite` | Timpa output `.webp` yang sudah ada |
| `--auto` | Pilih setting WebP otomatis dan skip jika tidak lebih kecil |
| `-h, --help` | Tampilkan help |

### `imgslim scan <source...>`

Scan source code untuk menemukan referensi image lokal, lalu convert image tersebut ke WebP.

```bash
imgslim scan [options] <source...>
```

Options:

| Option | Deskripsi |
|---|---|
| `<source...>` | Satu atau lebih file/folder source code |
| `-q, --quality <number>` | Quality WebP `0-100`. Default: `80` |
| `-r, --recursive` | Scan folder source secara recursive |
| `--lossless` | Gunakan WebP lossless |
| `--overwrite` | Timpa output `.webp` yang sudah ada |
| `--auto` | Pilih setting WebP otomatis dan skip jika tidak lebih kecil |
| `--source-ext <extensions>` | Extension source yang discan, dipisah koma. Contoh: `ts,tsx,css` |
| `-h, --help` | Tampilkan help |

## Perilaku Penting

- ImgSlim membuat file `.webp`; file original tetap ada.
- ImgSlim tidak mengubah source code.
- Mode `scan` hanya menemukan referensi image lokal yang tertulis sebagai path biasa/string literal.
- URL remote seperti `https://example.com/image.png` dan data URI tidak dikonversi.
- Folder umum seperti `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, dan `.nuxt` diabaikan saat scan source code.
- Jika output `.webp` sudah ada, gunakan `--overwrite` untuk membuat ulang.

## Contoh Workflow Umum

### Project Web/Frontend

```bash
npm run build
imgslim scan ./src ./public --recursive --auto
```

### Folder Asset Saja

```bash
imgslim ./assets --recursive --auto
```

### Convert dengan Kualitas Tinggi

```bash
imgslim ./images --recursive --quality 90
```

### Convert dan Timpa WebP Lama

```bash
imgslim ./images --recursive --overwrite
```

## Development

Build TypeScript:

```bash
npm run build
```

Jalankan CLI lokal:

```bash
node dist/cli.js --help
node dist/cli.js scan --help
```
