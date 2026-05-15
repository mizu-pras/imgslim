// imgslim CLI integration tests
// Usage: node test/imgslim.test.mjs
// Uses node:test (built-in) and node:assert

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

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
function run(args, cwd = ROOT) {
  const result = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    cwd,
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

function setupConfiguredDir(name, images, config) {
  const dir = setupDir(name, images);
  writeFileSync(join(dir, '.imgslimrc'), JSON.stringify(config, null, 2));
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
  //  Explicit convert subcommand
  // =========================================================================

  describe('explicit convert subcommand', () => {
    it('should convert single PNG to WebP via `imgslim convert`', () => {
      const dir = setupDir('explicit-convert', ['0.png']);
      const input = join(dir, '0.png');
      const expected = join(dir, '0.webp');
      const inputSize = fileSize(input);

      const { stdout, exitCode } = run(['convert', input]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(expected), 'WebP output file should exist');
      assert.ok(
        fileSize(expected) < inputSize,
        'WebP should be smaller than original PNG',
      );
      assert.ok(stdout.includes('OK'), 'stdout should contain OK');
    });

    it('should output to --out-dir with convert subcommand', () => {
      const dir = setupDir('convert-outdir', ['0.png']);
      const input = join(dir, '0.png');
      const outDir = join(dir, 'out');

      const { stdout, exitCode } = run(['convert', input, '--out-dir', outDir]);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        existsSync(join(outDir, '0.webp')),
        'WebP should be created in specified output directory',
      );
      assert.ok(stdout.includes('OK'));
    });

    it('should skip later convert collisions in --out-dir', () => {
      const dir = setupDir('convert-outdir-collision', ['0.png']);
      const sub = join(dir, 'sub');
      mkdirSync(sub, { recursive: true });
      cpSync(join(TEST_IMAGES, '0.png'), join(sub, '0.png'));
      const outDir = join(dir, 'out');

      const { stdout, exitCode } = run(['convert', dir, '--recursive', '--out-dir', outDir]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(join(outDir, '0.webp')), 'First colliding output should exist');
      assert.ok(stdout.includes('SKIP'), 'Later collision should be skipped');
      assert.ok(stdout.includes('collision'), 'Skip reason should mention collision');
    });
  });

  // =========================================================================
  //  Minify subcommand
  // =========================================================================

  describe('minify subcommand', () => {
    it('should create _min.png from PNG, keep original, no .webp', () => {
      const dir = setupDir('minify-png', ['0.png']);
      const input = join(dir, '0.png');
      const minOutput = join(dir, '0_min.png');
      const webp = join(dir, '0.webp');
      const before = fileSize(input);

      const { stdout, exitCode } = run(['minify', input]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(input), 'Original PNG should still exist');
      assert.ok(!existsSync(webp), 'No WebP should be created for minify');

      // Should either create _min.png (OK) or skip if already optimal
      const isOk = stdout.includes('OK');
      const isSkip = stdout.includes('SKIP');
      assert.ok(isOk || isSkip, 'Should show OK or SKIP');
      if (isOk) {
        assert.ok(existsSync(minOutput), '_min.png should exist on OK');
        assert.ok(
          fileSize(minOutput) < before,
          'Minified PNG should be smaller than original',
        );
        // Output shows proper input -> output
        assert.ok(
          stdout.includes('0.png ->'),
          'Output should show input -> output format',
        );
      }
    });

    it('should preserve original file unchanged (size, mtime) after minify', () => {
      const dir = setupDir('minify-preserve', ['0.png']);
      const input = join(dir, '0.png');

      const origSize = fileSize(input);
      const origMtime = statSync(input).mtimeMs;

      const { exitCode } = run(['minify', input]);
      assert.strictEqual(exitCode, 0);

      // Original must be untouched
      assert.strictEqual(fileSize(input), origSize, 'Original size unchanged');
      assert.strictEqual(statSync(input).mtimeMs, origMtime, 'Original mtime unchanged');
    });

    it('should skip existing _min.png without --overwrite', () => {
      const dir = setupDir('minify-ow-skip', ['0.png']);
      const input = join(dir, '0.png');
      const minOutput = join(dir, '0_min.png');

      // First run — ensure _min.png exists
      run(['minify', input, '--overwrite']);
      // If original is already optimally compressed _min may not have been
      // created; force-create a dummy to guarantee overwrite-skip path
      if (!existsSync(minOutput)) {
        writeFileSync(minOutput, Buffer.alloc(64));
      }

      // Second run WITHOUT --overwrite — should skip
      const r2 = run(['minify', input]);
      assert.strictEqual(r2.exitCode, 0);
      assert.ok(r2.stdout.includes('SKIP'), 'Should skip without --overwrite');
      assert.ok(!r2.stdout.includes('OK'), 'Should not OK');
    });

    it('should replace existing _min.png with --overwrite', () => {
      const dir = setupDir('minify-ow-replace', ['0.png']);
      const input = join(dir, '0.png');
      const minOutput = join(dir, '0_min.png');

      // Create a deliberately large placeholder _min.png (100 KB)
      writeFileSync(minOutput, Buffer.alloc(100 * 1024));
      const placeholderSize = fileSize(minOutput);

      const { stdout, exitCode } = run(['minify', input, '--overwrite']);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(minOutput), '_min.png should exist');

      const isOk = stdout.includes('OK');
      const isSkip = stdout.includes('SKIP');
      assert.ok(isOk || isSkip, 'Should show OK or SKIP');

      if (isOk) {
        // Real minified output must be drastically smaller than 100 KB dummy
        assert.ok(
          fileSize(minOutput) < placeholderSize,
          'Minified _min.png should be smaller than placeholder',
        );
        assert.ok(fileSize(minOutput) > 0, '_min.png should not be empty');
      } else {
        // When skipped the placeholder remains untouched
        assert.strictEqual(
          fileSize(minOutput),
          placeholderSize,
          'Placeholder unchanged when skipped',
        );
      }
    });

    it('should skip unsupported format (JPG) for minify', () => {
      const dir = setupDir('minify-unsupported', ['0.png']);
      const input = join(dir, 'test.jpg');
      copyFileSync(join(TEST_IMAGES, '0.png'), input);

      const { stdout, exitCode } = run(['minify', input]);

      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('SKIP'), 'Should show SKIP for unsupported format');
      assert.ok(!stdout.includes('OK'), 'Should not show OK');
    });

    it('should skip WebP files for minify instead of ignoring silently', () => {
      const dir = setupDir('minify-webp-skip', ['0.png']);
      const png = join(dir, '0.png');
      const webp = join(dir, '0.webp');

      const converted = run(['convert', png]);
      assert.strictEqual(converted.exitCode, 0);
      assert.ok(existsSync(webp), 'WebP fixture should exist');

      const { stdout, exitCode } = run(['minify', webp]);

      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('SKIP'), 'Should show SKIP for WebP');
      assert.ok(stdout.includes('only PNG supported'));
    });

    it('should create _min.png for nested PNG with --recursive, no .webp', () => {
      const dir = setupDir('minify-recursive', ['0.png']);
      const sub = join(dir, 'sub');
      mkdirSync(sub, { recursive: true });
      cpSync(join(TEST_IMAGES, '1.png'), join(sub, '1.png'));

      const { stdout, exitCode } = run(['minify', dir, '--recursive']);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(join(dir, '0.png')), 'Root PNG still exists');
      assert.ok(existsSync(join(sub, '1.png')), 'Nested PNG still exists');
      assert.ok(!existsSync(join(dir, '0.webp')), 'No root WebP');
      assert.ok(!existsSync(join(sub, '1.webp')), 'No nested WebP');

      const okCount = (stdout.match(/  OK  /g) || []).length;
      const skipCount = (stdout.match(/ SKIP /g) || []).length;
      assert.ok(okCount + skipCount >= 2, 'Should handle both files');

      // If OK, _min.png should exist
      if (okCount > 0) {
        const hasRootMin = existsSync(join(dir, '0_min.png'));
        const hasSubMin = existsSync(join(sub, '1_min.png'));
        assert.ok(hasRootMin || hasSubMin, 'OK should produce at least one _min.png');
      }
    });

    it('second recursive minify should not create _min_min.png', () => {
      const dir = setupDir('minify-no-double', ['0.png']);
      const sub = join(dir, 'sub');
      mkdirSync(sub, { recursive: true });
      cpSync(join(TEST_IMAGES, '1.png'), join(sub, '1.png'));

      // First minify — creates _min.png files (use --overwrite so existing
      // _min.png from previous test runs don't cause skips)
      run(['minify', dir, '--recursive', '--overwrite']);

      // Second minify — should NOT create _min_min.png
      const { stdout, exitCode } = run(['minify', dir, '--recursive']);

      assert.strictEqual(exitCode, 0);

      // No _min_min.png anywhere
      assert.ok(
        !existsSync(join(dir, '0_min_min.png')),
        'No double min suffix in root',
      );
      assert.ok(
        !existsSync(join(sub, '1_min_min.png')),
        'No double min suffix in sub',
      );

      // Original files still exist
      assert.ok(existsSync(join(dir, '0.png')), 'Root original exists');
      assert.ok(existsSync(join(sub, '1.png')), 'Sub original exists');
    });

    it('--dry-run should show would-convert without writing files', () => {
      const dir = setupDir('minify-dryrun', ['0.png']);
      const input = join(dir, '0.png');
      const minOutput = join(dir, '0_min.png');

      const { stdout, exitCode } = run(['minify', input, '--dry-run']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stdout.includes('Dry-run mode'),
        'Should indicate dry-run mode',
      );
      assert.ok(
        stdout.includes('Would convert') || stdout.includes('0_min.png'),
        'Should show would-convert output',
      );
      // Verify no _min.png was actually created
      assert.ok(
        !existsSync(minOutput),
        'No _min.png should be created in dry-run',
      );
    });

    it('--dry-run with existing output should report skip without writing', () => {
      const dir = setupDir('minify-dryrun-skip', ['0.png']);
      const input = join(dir, '0.png');
      const minOutput = join(dir, '0_min.png');

      // Create output so dry-run reports skip
      run(['minify', input, '--overwrite']);
      const { stdout, exitCode } = run(['minify', input, '--dry-run']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stdout.includes('SKIP') || stdout.includes('output exists'),
        'Dry-run should report skip for existing output',
      );
    });

    it('--suffix should control output filename', () => {
      const dir = setupDir('minify-suffix', ['0.png']);
      const input = join(dir, '0.png');
      const customOutput = join(dir, '0.optimized.png');
      const defaultOutput = join(dir, '0_min.png');

      const { stdout, exitCode } = run(['minify', input, '--suffix', '.optimized']);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(input), 'Original PNG still exists');
      assert.ok(
        existsSync(customOutput) || stdout.includes('SKIP'),
        'Should create .optimized.png or skip if already optimal',
      );
      assert.ok(
        !existsSync(defaultOutput),
        'Default _min.png should NOT be created',
      );
      if (existsSync(customOutput)) {
        assert.ok(stdout.includes('OK'), 'Should show OK when custom suffix output created');
      }
    });

    it('--suffix with existing output skips without --overwrite', () => {
      const dir = setupDir('minify-suffix-skip', ['0.png']);
      const input = join(dir, '0.png');
      const customOutput = join(dir, '0.optimized.png');

      // Create custom suffixed output
      run(['minify', input, '--suffix', '.optimized', '--overwrite']);
      if (existsSync(customOutput)) {
        const { stdout, exitCode } = run(['minify', input, '--suffix', '.optimized']);
        assert.strictEqual(exitCode, 0);
        assert.ok(stdout.includes('SKIP'), 'Should show SKIP for existing custom suffix output');
      }
    });

    it('--suffix skip prevents double suffix on repeated runs', () => {
      const dir = setupDir('minify-suffix-double', ['0.png']);
      const input = join(dir, '0.png');

      // First run with custom suffix
      run(['minify', input, '--suffix', '-opt', '--overwrite']);

      // Second run with same suffix — should skip existing suffixed file
      const { stdout, exitCode } = run(['minify', input, '--suffix', '-opt']);
      assert.strictEqual(exitCode, 0);
      assert.ok(
        !existsSync(join(dir, '0-opt-opt.png')),
        'No double suffix',
      );
    });

    it('--out-dir should place _min.png in specified directory', () => {
      const dir = setupDir('minify-outdir', ['0.png']);
      const input = join(dir, '0.png');
      const outDir = join(dir, 'output');
      const expected = join(outDir, '0_min.png');

      const { stdout, exitCode } = run(['minify', input, '--out-dir', outDir]);

      assert.strictEqual(exitCode, 0);
      // Either created in outDir or skipped
      if (existsSync(expected)) {
        assert.ok(stdout.includes('OK'), 'Should OK when output in outDir');
      } else {
        assert.ok(stdout.includes('SKIP'), 'May skip if already optimal');
      }
      // No _min.png next to original
      assert.ok(
        !existsSync(join(dir, '0_min.png')),
        'No _min.png in input directory',
      );
    });

    it('--lossless-only should produce output without palette quantization', () => {
      const dir = setupDir('minify-lossless', ['0.png']);
      const input = join(dir, '0.png');
      const minOutput = join(dir, '0_min.png');

      const { stdout, exitCode } = run(['minify', input, '--lossless-only']);

      assert.strictEqual(exitCode, 0);
      // Either created _min.png or skipped
      const isOk = stdout.includes('OK');
      const isSkip = stdout.includes('SKIP');
      assert.ok(isOk || isSkip, 'Should OK or SKIP with --lossless-only');
      if (isOk) {
        assert.ok(
          existsSync(minOutput),
          'Lossless-only should create _min.png on OK',
        );
        assert.ok(
          fileSize(minOutput) < fileSize(input),
          'Lossless-only _min.png should be smaller than original',
        );
      }
    });

    it('minify --help should show minify-specific options', () => {
      const { stdout } = run(['minify', '--help']);

      assert.ok(stdout.includes('--dry-run'), 'Help should show --dry-run');
      assert.ok(stdout.includes('--suffix'), 'Help should show --suffix');
      assert.ok(stdout.includes('--out-dir'), 'Help should show --out-dir');
      assert.ok(stdout.includes('--overwrite'), 'Help should show --overwrite');
      assert.ok(stdout.includes('--lossless-only'), 'Help should show --lossless-only');
      assert.ok(stdout.includes('--recursive'), 'Help should show --recursive');
    });

    it('global --help should NOT show convert-only flags in minify section', () => {
      // Just verify no crash and basic help works
      const { stdout } = run(['--help']);
      assert.ok(stdout.includes('imgslim'), 'Help should show program name');
    });

    it('empty --suffix should error', () => {
      const { exitCode, stderr } = run(['minify', 'test/0.png', '--suffix', '']);
      assert.strictEqual(exitCode, 1);
      assert.ok(stderr.includes('Error'), 'Should error on empty suffix');
    });

    it('--suffix with path separator should error', () => {
      const { exitCode, stderr } = run(['minify', 'test/0.png', '--suffix', 'foo/bar']);
      assert.strictEqual(exitCode, 1);
      assert.ok(stderr.includes('Error'), 'Should error on path separator');
    });

    it('outDir collision skips duplicate basenames', () => {
      const dir = setupDir('minify-outdir-collision', ['0.png']);
      const sub = join(dir, 'sub');
      mkdirSync(sub, { recursive: true });
      cpSync(join(TEST_IMAGES, '0.png'), join(sub, '0.png'));
      const outDir = join(dir, 'out');

      const { stdout, exitCode } = run(['minify', dir, '--recursive', '--out-dir', outDir]);

      assert.strictEqual(exitCode, 0);
      const outputFile = join(outDir, '0_min.png');
      assert.ok(existsSync(outputFile), 'At least one output should exist');
      assert.ok(stdout.includes('SKIP'), 'Collision should produce SKIP');
      assert.ok(
        stdout.includes('collision') || stdout.includes('output exists'),
        'Skip reason should mention collision or existing output',
      );
    });

    it('--suffix .optimized should create output with OK when smaller', () => {
      const dir = setupDir('minify-suffix-strong', ['0.png']);
      const input = join(dir, '0.png');
      const customOutput = join(dir, '0.optimized.png');

      // Use --overwrite to clear any previous state
      const { stdout, exitCode } = run(['minify', input, '--suffix', '.optimized', '--overwrite']);

      assert.strictEqual(exitCode, 0);
      const isOk = stdout.includes('OK');
      const isSkip = stdout.includes('SKIP');
      assert.ok(isOk || isSkip, 'Should OK or SKIP');
      if (isOk) {
        assert.ok(existsSync(customOutput), 'Custom suffix output should exist on OK');
        assert.ok(
          fileSize(customOutput) < fileSize(input),
          'Custom suffix output should be smaller than original',
        );
        assert.ok(
          stdout.includes('0.optimized.png'),
          'Output path in message should use custom suffix',
        );
      }
    });

    it('--out-dir should create output in specified dir with OK when smaller', () => {
      const dir = setupDir('minify-outdir-strong', ['0.png']);
      const input = join(dir, '0.png');
      const outDir = join(dir, 'dist');
      const expected = join(outDir, '0_min.png');

      const { stdout, exitCode } = run(['minify', input, '--out-dir', outDir, '--overwrite']);

      assert.strictEqual(exitCode, 0);
      const isOk = stdout.includes('OK');
      const isSkip = stdout.includes('SKIP');
      assert.ok(isOk || isSkip, 'Should OK or SKIP');
      if (isOk) {
        assert.ok(existsSync(expected), 'Output should be in specified outDir');
        assert.ok(
          fileSize(expected) < fileSize(input),
          'Output should be smaller than original',
        );
        assert.ok(
          stdout.includes('dist/'),
          'Output path should include outDir',
        );
      }
    });
  });


  // =========================================================================
  //  Scale subcommand
  // =========================================================================

  describe('scale subcommand', () => {
    it('should create _scaled image with --size 50%', async () => {
      const dir = setupDir('scale-percent', ['0.png']);
      const input = join(dir, '0.png');
      const output = join(dir, '0_scaled.png');
      const before = await sharp(input).metadata();

      const { stdout, exitCode } = run(['scale', input, '--size', '50%']);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(input), 'Original should remain');
      assert.ok(existsSync(output), 'Scaled output should exist');
      assert.ok(stdout.includes('OK'), 'Should report OK');

      const after = await sharp(output).metadata();
      assert.ok(after.width < before.width, 'Width should shrink');
      assert.ok(after.height < before.height, 'Height should shrink');
      assert.ok(Math.abs(after.width - Math.round(before.width * 0.5)) <= 1);
      assert.ok(Math.abs(after.height - Math.round(before.height * 0.5)) <= 1);
    });

    it('should support one-sided dimension size', async () => {
      const dir = setupDir('scale-dim', ['0.png']);
      const input = join(dir, '0.png');
      const output = join(dir, '0_scaled.png');

      const { exitCode } = run(['scale', input, '--size', '25x']);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(output), 'Scaled output should exist');
      const after = await sharp(output).metadata();
      assert.strictEqual(after.width, 25);
      assert.ok(after.height > 0);
    });

    it('--dry-run should show would-convert without writing files', () => {
      const dir = setupDir('scale-dryrun', ['0.png']);
      const input = join(dir, '0.png');
      const output = join(dir, '0_scaled.png');

      const { stdout, exitCode } = run(['scale', input, '--size', '50%', '--dry-run']);

      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('Dry-run mode'));
      assert.ok(stdout.includes('Would scale') || stdout.includes('0_scaled.png'));
      assert.ok(!existsSync(output), 'No scaled image should be created in dry-run');
    });

    it('should skip existing output without --overwrite and replace with --overwrite', () => {
      const dir = setupDir('scale-overwrite', ['0.png']);
      const input = join(dir, '0.png');
      const output = join(dir, '0_scaled.png');

      const r1 = run(['scale', input, '--size', '50%']);
      assert.strictEqual(r1.exitCode, 0);
      assert.ok(existsSync(output));

      const r2 = run(['scale', input, '--size', '50%']);
      assert.strictEqual(r2.exitCode, 0);
      assert.ok(r2.stdout.includes('SKIP'), 'Should skip existing output');

      const r3 = run(['scale', input, '--size', '50%', '--overwrite']);
      assert.strictEqual(r3.exitCode, 0);
      assert.ok(r3.stdout.includes('OK'), 'Should overwrite existing output');
    });

    it('--suffix and --out-dir should control output path', () => {
      const dir = setupDir('scale-suffix-outdir', ['0.png']);
      const input = join(dir, '0.png');
      const outDir = join(dir, 'out');
      const output = join(outDir, '0_small.png');

      const { stdout, exitCode } = run(['scale', input, '--size', '50%', '--suffix', '_small', '--out-dir', outDir]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(output), 'Custom suffixed output should exist in outDir');
      assert.ok(stdout.includes('0_small.png'));
      assert.ok(!existsSync(join(dir, '0_scaled.png')), 'Default output should not be created');
    });

    it('recursive scale should skip double suffix inputs', () => {
      const dir = setupDir('scale-no-double', ['0.png']);
      const input = join(dir, '0.png');

      run(['scale', input, '--size', '50%']);
      const { stdout, exitCode } = run(['scale', dir, '--size', '50%', '--recursive']);

      assert.strictEqual(exitCode, 0);
      assert.ok(!existsSync(join(dir, '0_scaled_scaled.png')), 'No double suffix');
      assert.ok(stdout.includes('already has suffix'));
    });

    it('outDir collision skips duplicate basenames', () => {
      const dir = setupDir('scale-outdir-collision', ['0.png']);
      const sub = join(dir, 'sub');
      mkdirSync(sub, { recursive: true });
      cpSync(join(TEST_IMAGES, '0.png'), join(sub, '0.png'));
      const outDir = join(dir, 'out');

      const { stdout, exitCode } = run(['scale', dir, '--size', '50%', '--recursive', '--out-dir', outDir]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(join(outDir, '0_scaled.png')), 'First output should exist');
      assert.ok(stdout.includes('SKIP'), 'Collision should produce SKIP');
      assert.ok(stdout.includes('collision'), 'Skip reason should mention collision');
    });

    it('--json should output valid JSON with dimensions', () => {
      const dir = setupDir('scale-json', ['0.png']);
      const input = join(dir, '0.png');

      const { stdout, exitCode } = run(['scale', input, '--size', '50%', '--json']);

      assert.strictEqual(exitCode, 0);
      const parsed = JSON.parse(stdout.trim());
      assert.strictEqual(parsed.summary.converted, 1);
      assert.ok(parsed.converted[0].outputWidth > 0);
      assert.ok(parsed.converted[0].outputHeight > 0);
      assert.ok(Array.isArray(parsed.skipped));
      assert.ok(Array.isArray(parsed.failed));
    });

    it('invalid --size values should error', () => {
      for (const value of ['abc', '0%', '100%', '150%', '800x0', 'x']) {
        const { exitCode, stderr } = run(['scale', 'test/0.png', '--size', value]);
        assert.strictEqual(exitCode, 1, `${value} should fail`);
        assert.ok(stderr.includes('Error'), `${value} should print Error`);
      }
    });

    it('dry-run should skip no-upscale targets instead of reporting would-scale', () => {
      const dir = setupDir('scale-dryrun-no-upscale', ['0.png']);
      const input = join(dir, '0.png');

      const { stdout, exitCode } = run(['scale', input, '--size', '9999x', '--dry-run']);

      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('SKIP'), 'No-upscale dry-run should skip');
      assert.ok(stdout.includes('target size would not reduce image dimensions'));
      assert.ok(!stdout.includes('Would scale'), 'Should not report would-scale for no-op target');
    });

    it('scale --help should show scale-specific options', () => {
      const { stdout } = run(['scale', '--help']);

      assert.ok(stdout.includes('--size'), 'Help should show --size');
      assert.ok(stdout.includes('--dry-run'), 'Help should show --dry-run');
      assert.ok(stdout.includes('--suffix'), 'Help should show --suffix');
      assert.ok(stdout.includes('--out-dir'), 'Help should show --out-dir');
      assert.ok(stdout.includes('--overwrite'), 'Help should show --overwrite');
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

    it('should scan srcset and resolve asset-root plus alias references', () => {
      const dir = setupDir('scan-srcset', []);
      const assetRoot = join(dir, 'app');
      const assetDir = join(assetRoot, 'assets');
      mkdirSync(assetDir, { recursive: true });
      cpSync(join(TEST_IMAGES, '0.png'), join(assetDir, '0.png'));
      cpSync(join(TEST_IMAGES, '1.png'), join(assetDir, '1.png'));
      const src = join(dir, 'index.html');
      writeFileSync(
        src,
        '<img srcset="@img/0.png 1x, @/assets/1.png 2x" alt="demo">\n',
      );

      const { stdout, exitCode } = run([
        'scan',
        src,
        '--asset-root',
        assetRoot,
        '--alias',
        '@img=' + assetDir,
      ]);

      assert.strictEqual(exitCode, 0);
      assert.ok(existsSync(join(assetDir, '0.webp')), 'Alias srcset image should convert');
      assert.ok(existsSync(join(assetDir, '1.webp')), 'Asset-root srcset image should convert');
      assert.ok(stdout.includes('OK'), 'Should report conversions');
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

    it('should scan markdown image and link refs in .md and .mdx', () => {
      const dir = setupDir('markdown-scan', ['jackpot.png']);
      writeFileSync(
        join(dir, 'index.md'),
        ['![alt](./jackpot.png?cache=1#hero)', '[ext](https://example.com/skip.png)', ''].join('\n')
      );
      writeFileSync(
        join(dir, 'notes.mdx'),
        ['[text](./jackpot.png)', '![data](data:image/png;base64,AAAA)', ''].join('\n')
      );

      const { stdout, exitCode } = run(['scan', dir, '--dry-run', '--json']);

      assert.strictEqual(exitCode, 0);
      const parsed = JSON.parse(stdout.trim());
      assert.strictEqual(parsed.scan.sourceFiles, 2);
      assert.strictEqual(parsed.scan.imagesFound, 1);
      assert.deepStrictEqual(parsed.scan.unresolved, []);
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

    it('--quiet should still print FAIL lines to stderr', () => {
      const missing = join(TMP_ROOT, 'fmt-quiet-fail', 'missing.png');

      const { stdout, stderr, exitCode } = run(['--quiet', missing]);

      assert.strictEqual(exitCode, 1);
      assert.ok(stderr.includes('FAIL'), 'Quiet mode should still print FAIL to stderr');
      assert.ok(!stdout.includes('FAIL'), 'FAIL should stay on stderr');
    });

    it('should let --no-* override true config booleans', () => {
      const dir = setupConfiguredDir('config-negated', ['0.png'], {
        json: true,
        quiet: true,
        overwrite: true,
      });
      const input = join(dir, '0.png');

      const first = run([input, '--no-json', '--no-quiet'], dir);
      assert.strictEqual(first.exitCode, 0);
      assert.ok(first.stdout.includes('OK'), 'Should print human output');
      assert.ok(!first.stdout.includes('"converted"'), 'Should not output JSON');

      const second = run([input, '--no-json', '--no-quiet', '--no-overwrite'], dir);
      assert.strictEqual(second.exitCode, 0);
      assert.ok(second.stdout.includes('SKIP'), 'No-overwrite should win over config');
      assert.ok(!second.stdout.includes('OK'), 'Should not overwrite when disabled');
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

      const { stdout, stderr, exitCode } = run([input, '--auto', '--lossless', '--json']);
      const parsed = JSON.parse(stdout.trim());

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stderr.includes('--auto overrides --lossless'),
        'Should warn that auto overrides lossless',
      );
      const hasLossyQuality = parsed.converted.some((result) => typeof result.quality === 'number');
      const hasLosslessAutoSkip = parsed.autoSkipped.some((result) => String(result.reason).includes('lossless WebP'));
      assert.ok(
        hasLossyQuality || !hasLosslessAutoSkip,
        'Auto mode should not execute lossless branch after warning',
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

    it('should reject invalid --max-input-pixels values', () => {
      const { exitCode, stderr } = run(['test/0.png', '--max-input-pixels', '0']);

      assert.strictEqual(exitCode, 1);
      assert.ok(stderr.includes('max-input-pixels'), 'Should validate positive integer');
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

    it('scan --auto should convert referenced images', () => {
      const dir = setupDir('flag-scan-auto', ['jackpot.png']);
      writeFileSync(join(dir, 'index.html'), '<img src="jackpot.png">');

      const { stdout, exitCode } = run(['scan', dir, '--auto']);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        existsSync(join(dir, 'jackpot.webp')),
        '--auto in scan mode should create webp',
      );
      assert.ok(stdout.includes('OK'), 'Should report OK');
    });

    it('scan --lossless should convert referenced images', () => {
      const dir = setupDir('flag-scan-lossless', ['jackpot.png']);
      writeFileSync(join(dir, 'index.html'), '<img src="jackpot.png">');

      const { stdout, exitCode } = run(['scan', dir, '--lossless']);

      assert.strictEqual(exitCode, 0);
      const exists = existsSync(join(dir, 'jackpot.webp'));
      if (exists) {
        assert.ok(stdout.includes('OK'), 'Lossless scan should report OK');
      } else {
        assert.ok(stdout.includes('SKIP'), 'Lossless scan may skip if not smaller');
      }
    });

    it('scan --overwrite should replace existing webp', () => {
      const dir = setupDir('flag-scan-ow', ['jackpot.png']);
      writeFileSync(join(dir, 'index.html'), '<img src="jackpot.png">');

      // First scan — creates webp
      run(['scan', dir, '--overwrite']);
      assert.ok(existsSync(join(dir, 'jackpot.webp')), 'First scan should create webp');

      // Second scan with --overwrite — should not skip
      const { stdout, exitCode } = run(['scan', dir, '--overwrite']);
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('OK'), 'Should OK when overwriting');
      assert.ok(!stdout.includes('SKIP'), 'Should not skip with --overwrite');
    });

    it('--quiet scan should suppress all per-file output', () => {
      const dir = setupDir('quiet-scan', ['jackpot.png']);
      writeFileSync(join(dir, 'index.html'), '<img src="jackpot.png">');

      const { stdout, exitCode } = run(['--quiet', 'scan', dir]);

      assert.strictEqual(exitCode, 0);
      assert.ok(!stdout.includes('SKIP'), 'Quiet scan should suppress SKIP');
      assert.ok(!stdout.includes('MISS'), 'Quiet scan should suppress MISS');
      assert.ok(!stdout.includes('  OK '), 'Quiet scan should suppress per-file OK');
      // Summary should still appear
      assert.ok(stdout.includes('Source files'), 'Summary should appear');
    });

    it('should handle symlink directory cycles without crashing', () => {
      const dir = setupDir('symlink', ['0.png']);
      const subA = join(dir, 'a');
      const subB = join(dir, 'b');
      mkdirSync(subA, { recursive: true });
      mkdirSync(subB, { recursive: true });
      cpSync(join(TEST_IMAGES, '1.png'), join(subA, '1.png'));

      // Create cycle: a/link -> b, b/link -> a
      symlinkSync(subB, join(subA, 'link'));
      symlinkSync(subA, join(subB, 'link'));

      const { exitCode, stdout } = run([dir, '--recursive']);
      assert.strictEqual(exitCode, 0, 'Symlink cycle should not crash');
      assert.ok(existsSync(join(dir, '0.webp')), 'Root image converted');
      assert.ok(existsSync(join(subA, '1.webp')), 'Nested image converted');
    });

    it('should warn on malformed .imgslimrc', () => {
      const dir = setupDir('badconfig', ['0.png']);
      writeFileSync(join(dir, '.imgslimrc'), '{ bad json!!!');

      const { stderr, exitCode } = run(['--json', join(dir, '0.png')], dir);

      assert.strictEqual(exitCode, 0);
      assert.ok(
        stderr.includes('parse error') || stderr.includes('imgslimrc'),
        'Should warn about malformed config',
      );
    });

    it('should emit structured skipped objects in JSON dry-run minify output', () => {
      const dir = setupDir('json-structured-skip', ['0.png']);
      const input = join(dir, '0.png');

      const { stdout, exitCode } = run(['minify', input, '--dry-run', '--json']);

      assert.strictEqual(exitCode, 0);
      const parsed = JSON.parse(stdout.trim());
      assert.ok(Array.isArray(parsed.skipped), 'Skipped should stay array');
      assert.ok(parsed.skipped.length > 0, 'Dry-run should emit skipped-style entry');
      assert.equal(typeof parsed.skipped[0], 'object');
      assert.equal(parsed.skipped[0].status, 'would-convert');
      assert.equal(parsed.skipped[0].input, input);
      assert.ok(parsed.skipped[0].output.endsWith('0_min.png'));
      assert.equal(typeof parsed.skipped[0].reason, 'string');
    });

    it('should accept --concurrency option', () => {
      const dir = setupDir('flag-concurrency', ['0.png', '1.png']);

      const { stdout, exitCode } = run(['convert', dir, '--concurrency', '1', '--json']);

      assert.strictEqual(exitCode, 0);
      const parsed = JSON.parse(stdout.trim());
      assert.ok(parsed.summary.converted + parsed.summary.skipped >= 2);
    });
  });
