// Convert country code to flag emoji
// Uses Unicode Regional Indicator Symbols
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '🌍';
  const upper = code.toUpperCase();
  // Special cases for non-ISO codes
  if (upper === 'UK') return '🇬🇧';
  // Convert each letter to its regional indicator
  const A = 0x1F1E6;
  const code1 = upper.charCodeAt(0) - 'A'.charCodeAt(0) + A;
  const code2 = upper.charCodeAt(1) - 'A'.charCodeAt(0) + A;
  try {
    return String.fromCodePoint(code1, code2);
  } catch {
    return '🌍';
  }
}

// Get all regions with display names
export const REGIONS: Record<string, string> = {
  Americas: 'Americas',
  Europe: 'Europe',
  Asia: 'Asia',
  MENA: 'Middle East & N. Africa',
  Africa: 'Africa',
  Oceania: 'Oceania',
  Other: 'Other',
};

export function regionFlag(region: string): string {
  switch (region) {
    case 'Americas': return '🌎';
    case 'Europe': return '🌍';
    case 'Asia': return '🌏';
    case 'MENA': return '🕌';
    case 'Africa': return '🌍';
    case 'Oceania': return '🌏';
    default: return '🌐';
  }
}
