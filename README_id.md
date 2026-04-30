# ImgSlim

Konversi gambar ke WebP dari command line. File lebih kecil, kualitas tetap.

Dua cara penggunaan:

1. **Konversi langsung** — arahkan ke gambar atau folder, dapatkan file `.webp`.
2. **Pemindaian source code** — pindai kode untuk referensi gambar, konversi semua gambar yang ditemukan.

> ImgSlim tidak pernah menghapus atau memodifikasi file original. `photo.png` tetap ada — kamu dapat `photo.webp` di sebelahnya.

---

## Format yang Didukung

Mengkonversi format berikut ke WebP:

- `.png`
- `.jpg` / `.jpeg`
- `.svg`

> **Tentang SVG:** Sharp melakukan rasterisasi SVG ke PNG terlebih dahulu, lalu di-encode ke WebP. Output-nya adalah bitmap — skalabilitas vektor hilang. Simpan SVG original jika kamu butuh rendering vektor murni.

---

## Instalasi

```bash
npm install -g imgslim
```

Butuh Node.js 18 atau lebih baru.

Selesai. Perintah `imgslim` sekarang tersedia di mana saja:

```bash
imgslim --help
```

---

## Mulai Cepat

**Konversi gambar tertentu** — arahkan ke file atau folder, semua gambar yang didukung akan dikonversi:

```bash
imgslim photo.jpg                    # satu file → photo.webp
imgslim hero.png banner.jpg logo.svg # banyak file
imgslim ./images --recursive         # semua gambar di folder (dan subfolder)
```

**Pindai source code** — hanya mengkonversi gambar yang benar-benar direferensikan di kode:

```bash
imgslim scan ./src --recursive
```

Contoh: jika `./images/` berisi `logo.png`, `hero.jpg`, dan `draft.png` — tapi hanya `logo.png` dan `hero.jpg` yang muncul di HTML/CSS/JS — mode scan hanya mengkonversi dua itu. Mode langsung (`imgslim ./images`) mengkonversi ketiganya.

---

## Penggunaan

### Konversi Langsung

Gunakan saat kamu sudah tahu gambar mana yang ingin dikonversi.

```bash
imgslim <file atau folder...>
```

**Satu file**

```bash
imgslim photo.jpg
```

**Banyak file**

```bash
imgslim a.jpg b.png c.svg
```

**Folder (hanya level atas)**

```bash
imgslim ./images
```

**Folder (rekursif)**

```bash
imgslim ./images --recursive
imgslim -r ./images
```

**Output ke folder berbeda**

```bash
imgslim photo.png --out-dir ./webp
imgslim -o ./webp photo.png
```

Hasil: `./webp/photo.webp`

---

### Pemindaian Source Code

Pindai source code untuk referensi gambar lokal, lalu konversi gambar yang ditemukan.

```bash
imgslim scan <file atau folder source...>
```

**Contoh**

```bash
imgslim scan ./src --recursive
```

**Cara kerja**

1. Membaca file source (HTML, CSS, JS, TS, dll.)
2. Menemukan referensi gambar lokal (mis. `"./logo.png"`, `url("../bg.jpg")`, `![Alt](./img.png)`)
3. Menyelesaikan referensi ke file aktual
4. Mengkonversi setiap gambar yang ditemukan ke `.webp` di sebelah original
5. Melaporkan hasilnya

**Pola referensi yang didukung**

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

**Yang diabaikan**
- URL remote (`https://...`)
- Data URI (`data:...`)
- Ekspresi dinamis (`` `./img${n}.png` ``)

**Ekstensi file source default**

`.html` `.htm` `.css` `.scss` `.sass` `.less` `.js` `.jsx` `.ts` `.tsx` `.vue` `.svelte` `.astro` `.md` `.mdx`

**Opsi khusus scan**

| Opsi | Deskripsi |
|---|---|
| `--dry-run` | Pratinjau apa yang akan dikonversi tanpa menulis file |
| `--source-ext <exts>` | Hanya pindai ekstensi tertentu (mis. `ts,tsx,css`) |

---

### Opsi Bersama

Semua opsi berfungsi di kedua mode. Mode scan juga mendukung `--dry-run` dan `--source-ext` khusus.

**Kualitas** (default: `80`)

```bash
imgslim photo.jpg --quality 90
imgslim -q 90 photo.jpg
```

**Lossless**

```bash
imgslim photo.png --lossless
```

**Mode otomatis** — menguji beberapa pengaturan, memilih hasil terbaik. Melewati file jika WebP tidak lebih kecil.

```bash
imgslim photo.png --auto
```

> Menggabungkan `--auto` dengan `--quality` atau `--lossless` akan memunculkan peringatan — mode otomatis memilih pengaturannya sendiri.

**Overwrite** — ganti file `.webp` yang sudah ada. Secara default, output yang sudah ada dilewati.

```bash
imgslim photo.png --overwrite
```

> `--overwrite` hanya mempengaruhi output `.webp`. File original tidak pernah disentuh.

**Rekursif** — pindai folder secara rekursif.

```bash
imgslim ./images --recursive
imgslim scan ./src --recursive
```

---

## Output CLI

### Status per file

```
  OK  src/assets/logo.png -> src/assets/logo.webp  (42.1%, 18.4 KB) [q90]
```

| Status | Arti |
|---|---|
| `OK` | Berhasil dikonversi |
| `SKIP` | Dilewati — output sudah ada, atau mode otomatis tidak menemukan manfaat |
| `MISS` | Gambar direferensikan di source tapi file tidak ditemukan |
| `FAIL` | Error saat membaca atau mengkonversi |

### Ringkasan

Setelah konversi, kamu mendapat ringkasan:

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

### Mode quiet

Sembunyikan output per file, tampilkan ringkasan saja:

```bash
imgslim ./images --recursive --quiet
```

### Mode verbose

Tampilkan waktu untuk setiap file:

```bash
imgslim ./images --verbose
```

```
  OK  images/hero.png -> images/hero.webp  (74.4%, 35.0 KB) [128ms]
```

### Output JSON

Format terbaca mesin untuk skrip dan CI/CD:

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

Mode scan menambahkan detail scan:

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

> Output JSON ke stdout. Progress dan peringatan ke stderr — aman untuk pipe: `imgslim ... --json > report.json`

---

## File Konfigurasi

Buat file `.imgslimrc` untuk mengatur default. Letakkan di:

1. `~/.imgslimrc` — default global (berlaku di mana saja)
2. `./.imgslimrc` — default proyek (menimpa global)

Flag CLI selalu menimpa nilai konfigurasi.

**Contoh**

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

**Semua kunci yang tersedia**

| Kunci | Tipe | Deskripsi |
|---|---|---|
| `quality` | number | Kualitas WebP `0`–`100` |
| `outDir` | string | Direktori output default |
| `recursive` | boolean | Selalu pindai direktori secara rekursif |
| `lossless` | boolean | Gunakan WebP lossless |
| `overwrite` | boolean | Selalu timpa `.webp` yang sudah ada |
| `auto` | boolean | Selalu gunakan mode otomatis |
| `sourceExt` | string | Ekstensi source default (dipisah koma) |
| `verbose` | boolean | Selalu tampilkan waktu per file |
| `quiet` | boolean | Selalu tampilkan ringkasan saja |
| `json` | boolean | Selalu output JSON |

---

## Workflow Umum

**Proyek frontend — pindai dan konversi semua gambar**

```bash
imgslim scan ./src ./public --recursive --auto
```

**Konversi folder aset**

```bash
imgslim ./assets --recursive --auto
```

**Konversi kualitas tinggi**

```bash
imgslim ./images --recursive --quality 90
```

**Regenerasi semua file WebP**

```bash
imgslim ./images --recursive --overwrite
```

**Pipeline CI/CD**

```bash
imgslim ./images --recursive --json --quiet > report.json
```

---

## Hal yang Perlu Diketahui

- **File original tidak pernah dihapus atau dimodifikasi.** Hanya file `.webp` yang dibuat.
- **File source code tidak pernah dimodifikasi.** Perintah scan hanya membacanya.
- **Mode scan hanya mendeteksi referensi string biasa.** Ekspresi dinamis seperti `` `./img${n}.png` `` tidak ditemukan.
- **URL remote** (`https://...`) dan **data URI** (`data:...`) diabaikan.
- **Direktori yang dilewati** saat pemindaian source: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt`.
- **Penulisan atomik.** File ditulis ke path sementara lalu di-rename — tidak ada risiko output korup jika proses crash.
- **File `.webp` yang sudah ada dilewati** secara default. Gunakan `--overwrite` untuk membuat ulang.

---

- [Changelog](CHANGELOG.md)
- [paket npm](https://www.npmjs.com/package/imgslim)
- [GitHub](https://github.com/mizu-pras/imgslim)
