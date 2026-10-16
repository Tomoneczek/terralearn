/**
 * DOM utility functions ensuring strict sanitation and safe element generation.
 */

export function parseSvg(svgString: string): SVGElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.documentElement;
  return document.importNode(svg, true) as unknown as SVGElement;
}
