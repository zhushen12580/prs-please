export function normalizeSeed(input: string): string | null {
  const seed = input.trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(seed) ? seed : null;
}

export function fnv1a(input: string): number {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(input)) {
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function orderCases(
  caseIds: readonly string[],
  contentVersion: string,
  seed: string,
  day: number,
): string[] {
  const ordered = [...caseIds].sort();
  const random = mulberry32(fnv1a(`${contentVersion}:${seed}:${day}`));
  for (let index = ordered.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  }
  return ordered;
}
