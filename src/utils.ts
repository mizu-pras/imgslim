export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function percentSaved(inputSize: number, outputSize: number): string {
  if (inputSize === 0) return "0%";
  const pct = ((inputSize - outputSize) / inputSize) * 100;
  return `${pct.toFixed(1)}%`;
}
