// imgslim CLI integration tests
// Usage: node test/imgslim.test.mjs
// Uses node:test (built-in) and node:assert

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const CLI = join(ROOT, 'dist', 'cli.js');
const TEST_IMAGES = __dirname;
const TMP_ROOT = join(__dirname, 'test', 'tmp');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the imgslim CLI and return the result.
 * On success: { stdout, stderr: '', exitCode: 0 }
 * On failure: { stdout, stderr, exitCode: number }
 */
function run(args) {
  const result = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    stdio: 'pipe',
  });
  return {
    stdout: (result.stdout || '').toString(),
    stderr: (result.stderr || '').toString(),
    exitCode: result.status ?? 1,
  };
}

/**
 * Create an isolated test subdirectory with a copy of the listed test images.
 * Returns the absolute path to the new directory.
 */
function setupDir(name, images = []) {
  const dir = join(TMP_ROOT, name);
  mkdirSync(dir, { recursive: true });
  for (const img of images) {
    cpSync(join(TEST_IMAGES, img), join(dir, img));
  }
  return dir;
}

/** Return file size in bytes. */
function fileSize(p) {
  return statSync(p).size;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

before(() => {
  mkdirSync(TMP_ROOT, { recursive: true });
});

after(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('imgslim CLI', () => {
  // =========================================================================
  //  Direct conversion mode
  // =========================================================================

  describe('direct conversion', () => {
    it('should convert single PNG to WebP', () => {
      const dir = setupDir('single', ['0.png']);
      const input = join(dir, '0.png');
      const expected = join(dir, '0.webp');
      const inputSize = fileSize(input);

      const { stdout, exitCode } = run([input]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(expected), 'WebP output file should exist');
      assert.ok(
        fileSize(expected) < inputSize,
        'WebP should be smaller than original PNG',
      );
      assert.ok(stdout.includes('OK'), 'stdout should contain OK');
    });

    it('should output to --out-dir', () => {
      const dir = setupDir('outdir', ['0.png']);
      const input = join(dir, '0.png');
      const outDir = join(dir, 'out');

      const { stdout, exitCode } = run([input, '--out-dir', outDir]);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        existsSync(join(outDir, '0.webp')),
        'WebP should be created in specified output directory',
      );
      assert.ok(stdout.includes('OK'));
    });

    it('lower --quality produces a smaller file', () => {
      const dir = setupDir('quality', ['0.png']);
      const input = join(dir, '0.png');

      // Copy to separate sub-dirs so output webp filenames don't collide
      const d10 = join(dir, 'q10');
      const d80 = join(dir, 'q80');
      mkdirSync(d10, { recursive: true });
      mkdirSync(d80, { recursive: true });
      cpSync(input, join(d10, '0.png'));
      cpSync(input, join(d80, '0.png'));

      run([join(d10, '0.png'), '--quality', '10']);
      run([join(d80, '0.png'), '--quality', '80']);

      const size10 = fileSize(join(d10, '0.webp'));
      const size80 = fileSize(join(d80, '0.webp'));

      assert.ok(
        size10 < size80,
        'Quality-10 WebP should be smaller than quality-80 WebP',
      );
    });

    it('should convert with --lossless', () => {
      const dir = setupDir('lossless', ['0.png']);
      const input = join(dir, '0.png');
      const expected = join(dir, '0.webp');

      const { stdout, exitCode } = run([input, '--lossless']);

      assert.strictEqual(exitCode, 0);
      if (existsSync(expected)) {
        assert.ok(stdout.includes('OK'), 'Lossless conversion should show OK');
      } else {
        // Lossless WebP may be skipped if not smaller than original
        assert.ok(
          stdout.includes('SKIP'),
          'Lossless mode should skip when not smaller',
        );
      }
    });

    it('--overwrite replaces an existing WebP without skipping', () => {
      const dir = setupDir('overwrite', ['0.png']);
      const input = join(dir, '0.png');
      const expected = join(dir, '0.webp');

      // 1st conversion — creates webp
      const r1 = run([input]);
      assert.strictEqual(r1.exitCode, 0);
      assert.ok(existsSync(expected));
      assert.ok(r1.stdout.includes('OK'));

      // 2nd conversion WITHOUT --overwrite — should skip
      const r2 = run([input]);
      assert.strictEqual(r2.exitCode, 0);
      assert.ok(r2.stdout.includes('SKIP'), 'Should skip without --overwrite');
      assert.ok(!r2.stdout.includes('OK'), 'Should not contain OK');

      // 3rd conversion WITH --overwrite — should convert (no skip)
      const r3 = run([input, '--overwrite']);
      assert.strictEqual(r3.exitCode, 0);
      assert.ok(r3.stdout.includes('OK'), 'Should succeed with --overwrite');
      assert.ok(
        !r3.stdout.includes('SKIP'),
        'Should not skip with --overwrite',
      );
    });

    it('should convert with --auto', () => {
      const dir = setupDir('auto', ['0.png']);
      const input = join(dir, '0.png');
      const expected = join(dir, '0.webp');

      const { stdout, exitCode } = run([input, '--auto']);

      assert.strictEqual(exitCode, 0);
      if (existsSync(expected)) {
        assert.ok(
          stdout.includes('OK'),
          'Auto mode should show OK when converted',
        );
      } else {
        assert.ok(
          stdout.includes('SKIP'),
          'Auto mode should skip when no candidate is smaller',
        );
      }
    });

    it('should convert all images in a directory', () => {
      const dir = setupDir('dir', ['0.png', '1.png', '2.png']);

      const { stdout, exitCode } = run([dir]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(join(dir, '0.webp')), '0.webp created');
      assert.ok(existsSync(join(dir, '1.webp')), '1.webp created');
      assert.ok(existsSync(join(dir, '2.webp')), '2.webp created');

      const okCount = (stdout.match(/  OK  /g) || []).length;
      assert.strictEqual(okCount, 3, 'Exactly 3 conversions should be OK');
    });

    it('--recursive converts images in subdirectories', () => {
      const dir = setupDir('recursive', ['0.png']);
      const sub = join(dir, 'sub');
      mkdirSync(sub, { recursive: true });
      cpSync(join(TEST_IMAGES, '1.png'), join(sub, '1.png'));

      const { stdout, exitCode } = run([dir, '--recursive']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        existsSync(join(dir, '0.webp')),
        'Image in root directory converted',
      );
      assert.ok(
        existsSync(join(sub, '1.webp')),
        'Image in subdirectory converted',
      );
      assert.strictEqual(
        (stdout.match(/  OK  /g) || []).length,
        2,
        'Both images should report OK',
      );
    });

    it('should skip already-converted file without --overwrite', () => {
      const dir = setupDir('skip', ['0.png']);
      const input = join(dir, '0.png');

      // First conversion
      const r1 = run([input]);
      assert.ok(r1.stdout.includes('OK'));

      // Second conversion — output exists, no --overwrite
      const r2 = run([input]);
      assert.strictEqual(r2.exitCode, 0);
      assert.ok(r2.stdout.includes('SKIP'), 'Should show SKIP');
      assert.ok(!r2.stdout.includes('OK'), 'Should NOT show OK');
    });
  });

  // =========================================================================
  //  Scan mode
  // =========================================================================

  describe('scan mode', () => {
    it('should find and convert images referenced in source files', () => {
      const dir = setupDir('scan-ref', ['jackpot.png']);
      const src = join(dir, 'index.html');
      writeFileSync(src, '<img src="jackpot.png" alt="jackpot">\n');

      const { stdout, exitCode } = run(['scan', src]);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        existsSync(join(dir, 'jackpot.webp')),
        'Referenced image should be converted to WebP',
      );
      assert.ok(stdout.includes('OK'), 'Conversion should report OK');
    });

    it('should filter source files by --source-ext', () => {
      const dir = setupDir('scan-ext', ['0.png', '1.png']);
      // Create two source files — one .html and one .ts
      writeFileSync(join(dir, 'page.html'), '<img src="0.png">');
      writeFileSync(join(dir, 'script.ts'), 'const img = "1.png";');

      // --- Without filter (defaults include both .html and .ts) ---
      const r1 = run(['scan', dir]);
      assert.strictEqual(r1.exitCode, 0);
      assert.ok(
        existsSync(join(dir, '0.webp')),
        'Default: .html-referenced image converted',
      );
      assert.ok(
        existsSync(join(dir, '1.webp')),
        'Default: .ts-referenced image converted',
      );

      // Clean up webp files
      rmSync(join(dir, '0.webp'));
      rmSync(join(dir, '1.webp'));

      // --- With --source-ext html — only .html files scanned ---
      const r2 = run(['scan', dir, '--source-ext', 'html']);
      assert.strictEqual(r2.exitCode, 0);
      assert.ok(
        existsSync(join(dir, '0.webp')),
        'Filter html: .html-referenced image converted',
      );
      assert.ok(
        !existsSync(join(dir, '1.webp')),
        'Filter html: .ts-referenced image NOT converted',
      );
    });

    it('--dry-run should show what would be converted without writing', () => {
      const dir = setupDir('scan-dryrun', ['jackpot.png', '0.png']);
      writeFileSync(join(dir, 'page.html'), '<img src="jackpot.png"><img src="0.png">');

      const { stdout, exitCode } = run(['scan', dir, '--dry-run']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stdout.includes('Dry-run mode'),
        'Should indicate dry-run mode',
      );
      assert.ok(
        stdout.includes('Would convert'),
        'Should show what would be converted',
      );
      assert.ok(
        stdout.includes('jackpot.webp'),
        'Should show target webp path',
      );
      // Verify no webp files were actually created
      assert.ok(
        !existsSync(join(dir, 'jackpot.webp')),
        'No webp should be created in dry-run',
      );
      assert.ok(
        !existsSync(join(dir, '0.webp')),
        'No webp should be created in dry-run',
      );
    });
  });

  // =========================================================================
  //  Output formats
  // =========================================================================

  describe('output formats', () => {
    it('--json should output valid JSON with expected keys', () => {
      const dir = setupDir('fmt-json', ['0.png']);
      const input = join(dir, '0.png');
      const expected = join(dir, '0.webp');

      const { stdout, stderr, exitCode } = run([input, '--json']);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(expected), 'WebP should still be created');

      let parsed;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        assert.fail('stdout should be valid JSON');
      }

      assert.ok(Array.isArray(parsed.converted), 'Should have converted array');
      assert.ok(Array.isArray(parsed.skipped), 'Should have skipped array');
      assert.ok(Array.isArray(parsed.failed), 'Should have failed array');
      assert.ok(parsed.summary, 'Should have summary');
      assert.strictEqual(parsed.summary.converted, 1);
      assert.ok(typeof parsed.summary.bytesSaved === 'number');
      assert.ok(typeof parsed.summary.percentSaved === 'string');

      // stdout should be JSON only — no human-readable text
      assert.ok(!stdout.includes(' OK '));
      assert.ok(!stdout.includes('SKIP'));
      assert.ok(!stdout.includes('──'));
    });

    it('--json scan should include scan result keys', () => {
      const dir = setupDir('fmt-json-scan', ['jackpot.png']);
      writeFileSync(join(dir, 'index.html'), '<img src="jackpot.png">');

      const { stdout, exitCode } = run(['scan', dir, '--json']);

      assert.strictEqual(exitCode, 0);

      const parsed = JSON.parse(stdout.trim());
      assert.ok(parsed.scan, 'Scan JSON should include scan key');
      assert.strictEqual(parsed.scan.sourceFiles, 1);
      assert.strictEqual(parsed.scan.imagesFound, 1);
      assert.ok(Array.isArray(parsed.scan.unresolved));
    });

    it('--quiet should suppress per-file lines', () => {
      const dir = setupDir('fmt-quiet', ['0.png']);
      const input = join(dir, '0.png');

      const { stdout, exitCode } = run([input, '--quiet']);

      assert.strictEqual(exitCode, 0);
      // In quiet mode, no "OK", "SKIP", "FAIL" per-file lines
      assert.ok(!stdout.includes('  OK '), 'Quiet should suppress OK lines');
      assert.ok(!stdout.includes(' SKIP'), 'Quiet should suppress SKIP lines');
      // Summary should still appear
      assert.ok(stdout.includes('Converted'), 'Summary should still appear');
    });

    it('--verbose should include timing info', () => {
      const dir = setupDir('fmt-verbose', ['0.png']);
      const input = join(dir, '0.png');

      const { stdout, exitCode } = run([input, '--verbose']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stdout.includes('ms]'),
        'Verbose should include timing ([XXms])',
      );
    });
  });

  // =========================================================================
  //  Flag validation
  // =========================================================================

  describe('flag validation', () => {
    it('should warn when --auto used with --lossless', () => {
      const dir = setupDir('flag-lossless', ['0.png']);
      const input = join(dir, '0.png');

      const { stderr, exitCode } = run([input, '--auto', '--lossless']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stderr.includes('--auto overrides --lossless'),
        'Should warn that auto overrides lossless',
      );
    });

    it('should warn when --auto used with explicit --quality', () => {
      const dir = setupDir('flag-quality', ['0.png']);
      const input = join(dir, '0.png');

      const { stderr, exitCode } = run([input, '--auto', '--quality', '50']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stderr.includes('--quality is ignored'),
        'Should warn that quality is ignored in auto mode',
      );
    });
  });

  // =========================================================================
  //  Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should exit with code 1 for a non-existent file', () => {
      const { exitCode, stdout, stderr } = run([
        join(TMP_ROOT, '_nonexistent_', 'nope.png'),
      ]);

      assert.strictEqual(exitCode, 1);
      const combined = stdout + stderr;
      assert.ok(
        combined.includes('FAIL'),
        'Should report FAIL for non-existent input',
      );
    });

    it('should exit with code 1 for invalid --quality value', () => {
      const { exitCode, stderr } = run([
        join(TEST_IMAGES, '0.png'),
        '--quality',
        'abc',
      ]);

      assert.strictEqual(exitCode, 1);
      assert.ok(
        stderr.includes('Error'),
        'Should report error for invalid quality value',
      );
    });
  });
});
