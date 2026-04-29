import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ImgSlimConfig {
  quality?: number;
  outDir?: string;
  recursive?: boolean;
  lossless?: boolean;
  overwrite?: boolean;
  auto?: boolean;
  sourceExt?: string;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
}

const VALID_BOOLEAN_KEYS = new Set([
  "recursive", "lossless", "overwrite", "auto", "verbose", "quiet", "json",
]);

function validateConfig(raw: unknown): ImgSlimConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    process.stderr.write("Warning: .imgslimrc must be a JSON object, ignoring\n");
    return {};
  }
  const obj = raw as Record<string, unknown>;
  const cleaned: ImgSlimConfig = {};

  for (const [key, value] of Object.entries(obj)) {
    switch (key) {
      case "quality": {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
          process.stderr.write(`Warning: .imgslimrc: "quality" must be a number 0-100, ignoring value "${String(value)}"\n`);
          continue;
        }
        cleaned.quality = value;
        break;
      }
      case "outDir":
      case "sourceExt": {
        if (typeof value !== "string") {
          process.stderr.write(`Warning: .imgslimrc: "${key}" must be a string, ignoring\n`);
          continue;
        }
        cleaned[key] = value;
        break;
      }
      default: {
        if (VALID_BOOLEAN_KEYS.has(key)) {
          if (typeof value !== "boolean") {
            process.stderr.write(`Warning: .imgslimrc: "${key}" must be true or false, ignoring value "${String(value)}"\n`);
            continue;
          }
          (cleaned as Record<string, unknown>)[key] = value;
        }
        // unknown keys silently ignored
      }
    }
  }

  return cleaned;
}

function loadConfigFile(filePath: string): ImgSlimConfig | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return validateConfig(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Warning: .imgslimrc parse error: ${message}\n`);
    return null;
  }
}

export function loadConfig(): ImgSlimConfig {
  const home = loadConfigFile(join(homedir(), ".imgslimrc"));
  const local = loadConfigFile(join(process.cwd(), ".imgslimrc"));

  // Merge: local overrides home
  return { ...home, ...local };
}
