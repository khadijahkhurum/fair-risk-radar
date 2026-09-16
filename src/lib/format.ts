export function fmtUsd(x: number): string {
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${Math.round(x / 1000)}k`;
  return `$${Math.round(x)}`;
}

export function fmtUsdShort(x: number): string {
  return x >= 1_000_000 ? `$${(x / 1_000_000).toFixed(1)}M` : `$${Math.round(x / 1000)}k`;
}

export function quantile(sortedArr: number[], q: number): number {
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sortedArr[base + 1] !== undefined
    ? sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base])
    : sortedArr[base];
}
