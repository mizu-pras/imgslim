import { readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

export interface WalkFilesOptions {
  recursive: boolean;
  shouldIncludeFile: (filePath: string) => boolean;
  ignoredDirs?: ReadonlySet<string>;
  visited?: Set<string>;
}

export function walkMatchingFiles(
  inputPath: string,
  options: WalkFilesOptions
): string[] {
  const visited = options.visited ?? new Set<string>();
  const stats = statSync(inputPath);

  let realPath: string;
  try {
    realPath = realpathSync(inputPath);
  } catch {
    return [];
  }

  if (visited.has(realPath)) {
    return [];
  }
  visited.add(realPath);

  if (stats.isFile()) {
    return options.shouldIncludeFile(inputPath) ? [inputPath] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const files: string[] = [];
  const entries = readdirSync(inputPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(inputPath, entry.name);

    let resolvedStats: ReturnType<typeof statSync> | null;
    try {
      resolvedStats = entry.isSymbolicLink() ? statSync(fullPath) : null;
    } catch {
      continue;
    }

    const isDir = resolvedStats ? resolvedStats.isDirectory() : entry.isDirectory();
    const isFile = resolvedStats ? resolvedStats.isFile() : entry.isFile();

    if (isDir && options.ignoredDirs?.has(entry.name)) {
      continue;
    }

    if (isFile && options.shouldIncludeFile(fullPath)) {
      files.push(fullPath);
      continue;
    }

    if (isDir && options.recursive) {
      files.push(
        ...walkMatchingFiles(fullPath, {
          ...options,
          visited,
        })
      );
    }
  }

  return files;
}
