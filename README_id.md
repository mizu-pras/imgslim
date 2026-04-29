# ImgSlim

CLI tool untuk mengkonversi gambar ke format WebP menggunakan [sharp](https://sharp.pixelplumbing.com/).

Dua mode utama:

1. **Konversi langsung** — konversi file/folder gambar ke WebP.
2. **Pemindaian source code** — pindai source code untuk referensi gambar lokal, lalu konversi gambar yang ditemukan ke WebP.

> **Catatan:** ImgSlim tidak pernah menghapus file original. Mengkonversi `photo.png` menghasilkan `photo.webp` berdampingan dengan `photo.png` yang tetap ada.

---

## Format yang Didukung

Format input yang dapat dikonversi ke WebP:

- `.png`
- `.jpg`
- `.jpeg`
- `.svg`

Output selalu `.webp`.

> **Catatan SVG:** Sharp melakukan rasterisasi SVG ke PNG terlebih dahulu sebelum di-encode ke WebP. Hasilnya adalah bitmap `.webp` — skalabilitas vektor hilang. Pertimbangkan ini saat menggunakan `.svg` sebagai aset vektor murni.

---

## Instalasi

```bash
npm install
npm run build
```

Setelah build, binary tersedia di `dist/cli.js`. Jika dipasang sebagai package global, perintah `imgslim` tersedia langsung.

Menjalankan langsung dari repositori:

```bash
node dist/cli.js --help
```

---

## Mulai Cepat

Konversi satu gambar:

```bash
imgslim photo.png
```

Output:

```txt
photo.png -> photo.webp
```

Pindai source code dan konversi gambar yang direferensikan:

```bash
imgslim scan ./src --recursive
```

Jika source code berisi:

```html
<img src="./assets/logo.png" />
```

ImgSlim membuat `./src/assets/logo.webp` tanpa menyentuh `./src/assets/logo.png`.

---

## Mode 1: Konversi Langsung

Gunakan mode ini jika Anda sudah tahu file atau folder gambar mana yang ingin dikonversi.

### Satu File

```bash
imgslim photo.png
```

Output dibuat di folder yang sama: `photo.webp`

### Banyak File

```bash
imgslim image1.jpg image2.png banner.svg
```

### Konversi Semua Gambar dalam Folder

Non-rekursif (hanya level atas):

```bash
imgslim ./images
```

Rekursif (termasuk subdirektori):

```bash
imgslim ./images --recursive
# atau
imgslim -r ./images
```

### Folder Output Khusus

```bash
imgslim photo.png --out-dir ./webp
# atau
imgslim -o ./webp photo.png
```

Hasil: `./webp/photo.webp`

### Kualitas WebP

Kualitas default adalah `80`. Rentang valid: `0`–`100`.

```bash
imgslim photo.png --quality 90
# atau
imgslim -q 90 photo.png
```

### WebP Lossless

```bash
imgslim photo.png --lossless
```

### Mode Otomatis

Menguji beberapa pengaturan WebP dan memilih hasil yang optimal. Melewati file jika tidak ada kandidat WebP yang lebih kecil dari original.

```bash
imgslim photo.png --auto
```

> **Catatan:** Menggunakan `--auto` bersama `--lossless` atau `--quality` eksplisit akan memicu peringatan — mode otomatis menggunakan strategi pemilihan kualitasnya sendiri.

### Timpa WebP yang Sudah Ada

Secara default, file output `.webp` yang sudah ada dilewati. Gunakan `--overwrite` untuk menggantinya:

```bash
imgslim photo.png --overwrite
```

> `--overwrite` hanya mengganti output `.webp`. File original (`.png`, `.jpg`, dll.) tidak pernah disentuh.

---

## Mode 2: Pemindaian Source Code

Pindai source code untuk menemukan referensi gambar lokal, lalu konversi gambar yang ditemukan ke WebP.

```bash
imgslim scan <source...>
```

Contoh:

```bash
imgslim scan ./src --recursive
```

### Cara Kerja

1. Membaca file source code.
2. Menemukan referensi gambar lokal (mis. `./logo.png`, `../assets/photo.jpg`, `url("./bg.png")`).
3. Menyelesaikan referensi ke file aktual di disk.
4. Mengkonversi gambar yang ditemukan ke `.webp` di lokasi yang sama.
5. Melaporkan item yang dikonversi, dilewati, tidak terselesaikan, dan gagal.

### Pola Referensi yang Terdeteksi

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

### Ekstensi Source Default

Pemindaian membaca file dengan ekstensi berikut secara default:

`.html` `.htm` `.css` `.scss` `.sass` `.less` `.js` `.jsx` `.ts` `.tsx` `.vue` `.svelte` `.astro` `.md` `.mdx`

### Opsi Scan

| Opsi | Deskripsi |
|---|---|
| `<source...>` | Satu atau lebih file/folder source code |
| `-q, --quality <number>` | Kualitas WebP `0`–`100` (default: `80`) |
| `-r, --recursive` | Pindai direktori secara rekursif |
| `--lossless` | Gunakan kompresi WebP lossless |
| `--overwrite` | Ganti file output `.webp` yang sudah ada |
| `--auto` | Pilih otomatis pengaturan WebP optimal |
| `--dry-run` | Pratinjau apa yang akan dikonversi tanpa menulis file |
| `--source-ext <exts>` | Ekstensi source yang dipindai, dipisah koma (mis. `ts,tsx,css`) |
| `--json` | Output hasil sebagai JSON terstruktur |
| `--verbose` | Tampilkan detail waktu per file |
| `--quiet` | Hanya tampilkan ringkasan, sembunyikan output per file |

### Dry Run

Pratinjau gambar mana yang akan dikonversi tanpa benar-benar menulis file:

```bash
imgslim scan ./src --recursive --dry-run
```

### Filter Berdasarkan Ekstensi Source

```bash
imgslim scan ./src --recursive --source-ext ts,tsx,css
```

### Mode Otomatis dengan Scan

```bash
imgslim scan ./src --recursive --auto
```

---

## Output CLI

### Status Per File

```
  OK  src/assets/logo.png -> src/assets/logo.webp  (42.1%, 18.4 KB) [q90]
```

| Status | Arti |
|---|---|
| `OK` | Berhasil dikonversi ke WebP |
| `SKIP` | Dilewati — output sudah ada, atau mode otomatis tidak menemukan kandidat yang lebih kecil |
| `MISS` | Gambar direferensikan di source tapi tidak ditemukan di disk |
| `FAIL` | Error saat membaca atau mengkonversi file |

### Ringkasan

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

## Format Output

### Output JSON (CI/CD)

Gunakan `--json` untuk output yang dapat dibaca mesin. Mencetak objek JSON terstruktur ke stdout (progress dan peringatan ke stderr).

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

Mode scan menambahkan field `scan`:

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

### Mode Verbose

Menambahkan informasi waktu per file:

```bash
imgslim ./images --verbose
```

```
  OK  images/hero.png -> images/hero.webp  (74.4%, 35.0 KB) [128ms]
```

### Mode Quiet

Menyembunyikan output per file, hanya menampilkan ringkasan:

```bash
imgslim ./images --recursive --quiet
```

---

## File Konfigurasi

ImgSlim mendukung file konfigurasi JSON `.imgslimrc` opsional. Dimuat dari dua lokasi (digabung — lokal menimpa home):

1. `~/.imgslimrc` (direktori home — default global)
2. `./.imgslimrc` (direktori saat ini — default proyek)

Flag CLI selalu menimpa nilai konfigurasi.

### Contoh `.imgslimrc`

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

| Kunci | Tipe | Deskripsi |
|---|---|---|
| `quality` | number | Kualitas WebP `0`–`100` |
| `outDir` | string | Direktori output default |
| `recursive` | boolean | Selalu pindai direktori secara rekursif |
| `lossless` | boolean | Gunakan WebP lossless |
| `overwrite` | boolean | Selalu timpa `.webp` yang sudah ada |
| `auto` | boolean | Selalu gunakan mode otomatis |
| `sourceExt` | string | Ekstensi source default (dipisah koma) |
| `verbose` | boolean | Selalu tampilkan detail waktu |
| `quiet` | boolean | Selalu sembunyikan output per file |
| `json` | boolean | Selalu output JSON |

---

## Perilaku Penting

- ImgSlim membuat file `.webp` berdampingan dengan original — file original **tidak pernah** dihapus atau dimodifikasi.
- File source code **tidak pernah** dimodifikasi. Mode scan hanya membacanya untuk menemukan referensi gambar.
- Mode scan hanya mendeteksi referensi gambar lokal yang ditulis sebagai string literal / path biasa. Ekspresi dinamis (mis. `` `./img${n}.png` ``) tidak terdeteksi.
- URL remote (`https://...`) dan data URI (`data:...`) diabaikan.
- Direktori umum dikecualikan saat pemindaian source: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt`.
- Jika output `.webp` sudah ada, gunakan `--overwrite` untuk membuat ulang.
- Penulisan atomik: file ditulis ke path sementara lalu di-rename — tidak ada risiko output korup saat crash.

---

## Workflow Umum

### Proyek Web / Frontend

```bash
npm run build
imgslim scan ./src ./public --recursive --auto
```

### Hanya Direktori Aset

```bash
imgslim ./assets --recursive --auto
```

### Konversi Kualitas Tinggi

```bash
imgslim ./images --recursive --quality 90
```

### Timpa Paksa

```bash
imgslim ./images --recursive --overwrite
```

### Pipeline CI/CD

```bash
imgslim ./images --recursive --json --quiet > report.json
```

---

## Pengembangan

Build TypeScript:

```bash
npm run build
```

Jalankan CLI secara lokal:

```bash
node dist/cli.js --help
node dist/cli.js scan --help
```

Jalankan pengujian:

```bash
node test/imgslim.test.mjs
```
