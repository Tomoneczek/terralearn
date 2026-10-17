/**
 * DOM utility functions ensuring strict sanitation, correct SVG namespaces and safe element generation.
 */

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function parseSvg(svgString: string): SVGElement {
  let content = svgString.trim();
  // Ensure the SVG namespace is present so browsers parse and render it as an actual SVG graphic
  if (!content.includes('xmlns=')) {
    content = content.replace(/<svg\b/i, `<svg xmlns="${SVG_NAMESPACE}"`);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');

  if (
    parserError ||
    !doc.documentElement ||
    doc.documentElement.namespaceURI !== SVG_NAMESPACE ||
    doc.documentElement.tagName.toLowerCase() !== 'svg'
  ) {
    // Robust fallback to HTML5 parser if XML parsing fails or lacks proper SVG namespace
    const htmlDoc = parser.parseFromString(content, 'text/html');
    const svgEl = htmlDoc.body.querySelector('svg');
    if (svgEl) {
      return document.importNode(svgEl, true) as unknown as SVGElement;
    }
  }

  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}
