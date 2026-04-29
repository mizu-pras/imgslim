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

function loadConfigFile(filePath: string): ImgSlimConfig | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as ImgSlimConfig;
  } catch {
    return null; // invalid JSON or unreadable — silently ignore
  }
}

export function loadConfig(): ImgSlimConfig {
  const home = loadConfigFile(join(homedir(), ".imgslimrc"));
  const local = loadConfigFile(join(process.cwd(), ".imgslimrc"));

  // Merge: local overrides home
  return { ...home, ...local };
}
