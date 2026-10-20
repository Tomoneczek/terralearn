/**
 * Dev mode is enabled only by the exact query parameter `?dev=true`.
 * Anything else (missing, `false`, `1`, `TRUE`) keeps the dev tooling out of the page.
 */
export function isDevMode(search: string): boolean {
  return new URLSearchParams(search).get('dev') === 'true';
}
