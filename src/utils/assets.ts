/**
 * Resolves a public asset path against the application base URL (import.meta.env.BASE_URL).
 * Handles paths with or without leading slashes and preserves external or scheme-based URLs.
 *
 * @param path - Relative or absolute asset path (e.g. '/data/lakes.json', 'textures/earth.jpg')
 * @returns Resolved asset path respecting base URL
 */
export function resolveAssetUrl(path: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }

  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${normalizedBase}${cleanPath}`;
}
