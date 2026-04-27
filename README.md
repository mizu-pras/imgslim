# ImgSlim

ImgSlim is a CLI tool to convert images (PNG, JPG, JPEG, SVG) to WebP format using [sharp](https://sharp.pixelplumbing.com/).

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Convert a single file (output next to input)
imgslim photo.png

# Convert multiple files
imgslim image1.jpg image2.png

# Specify output directory
imgslim -o ./webp photo.png

# Recursively convert all images in a directory
imgslim -r ./images

# Custom quality (default: 80)
imgslim -q 90 photo.png

# Lossless WebP
imgslim --lossless photo.png

# Overwrite existing output files
imgslim --overwrite photo.png

# Auto mode: analyze and pick the best WebP settings
imgslim --auto photo.png

# Auto mode with lossless
imgslim --auto --lossless photo.png
```

## Options

| Option              | Description                                      |
|---------------------|--------------------------------------------------|
| `<input...>`        | One or more input files or directories           |
| `-o, --out-dir`     | Output directory (default: next to input file)   |
| `-q, --quality`     | WebP quality 0-100 (default: 80)                 |
| `-r, --recursive`   | Recursively scan directories                     |
| `--lossless`        | Enable lossless WebP compression                 |
| `--overwrite`       | Allow overwriting existing output files          |
| `--auto`            | Analyze each image and choose the best WebP settings automatically |
