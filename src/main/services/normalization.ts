export function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function stringOrNull(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized === '' ? null : normalized;
}

export function normalizeSearchText(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSearchText(value: unknown): string[] {
  return normalizeSearchText(value)
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildFullName(firstName: string | null, surname: string | null): string {
  return [stringOrNull(firstName), stringOrNull(surname)].filter(Boolean).join(' ');
}

export function parseDateString(value: unknown): string | null {
  const text = stringOrNull(value);

  if (!text) {
    return null;
  }

  const parsedDate = new Date(text);

  if (Number.isNaN(parsedDate.getTime())) {
    return text;
  }

  return parsedDate.toISOString().slice(0, 10);
}

export function scoreFuzzyMatch(query: string, candidate: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedCandidate = normalizeSearchText(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 1;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 0.94;
  }

  const queryTokens = tokenizeSearchText(normalizedQuery);
  const candidateTokens = new Set(tokenizeSearchText(normalizedCandidate));
  let overlap = 0;

  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    } else if (normalizedCandidate.includes(token)) {
      overlap += 0.65;
    }
  }

  const coverage = overlap / queryTokens.length;
  const lengthPenalty = Math.min(normalizedQuery.length, normalizedCandidate.length) /
    Math.max(normalizedQuery.length, normalizedCandidate.length);

  return Number((coverage * 0.75 + lengthPenalty * 0.25).toFixed(4));
}