/** Sanitize a search string for use in PostgREST .or() / .ilike() filters */
export function sanitizeSearch(input: string): string {
  // Strip PostgREST special characters that could inject filter logic
  return input.replace(/[,.()"'\\]/g, '').trim().slice(0, 100)
}
