/**
 * Colour classes of the population density layer (people per km²). Logarithmic-ish breaks keep
 * both the sparsely populated interiors and the dense river valleys readable.
 */
export const DENSITY_BREAKS = [1, 10, 50, 100, 250, 1000] as const;

/** One colour per class: sequential yellow → red → magenta, readable on the satellite texture. */
export const DENSITY_COLORS = [
  '#ffffb2',
  '#fed976',
  '#feb24c',
  '#fd8d3c',
  '#f03b20',
  '#d4145a',
  '#a8006e',
] as const;

/** Sparse classes are more transparent so the landscape still shows through. */
export const DENSITY_OPACITY = [0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.8] as const;

/** Class index 0…6 of a density; invalid or non-positive values fall into the lowest class. */
export function densityClass(density: number): number {
  if (!(density > 0)) return 0;
  let index = 0;
  while (index < DENSITY_BREAKS.length && density >= DENSITY_BREAKS[index]!) index++;
  return index;
}

/** Legend label of a class: "< 1", "1–10", …, "> 1000". */
export function densityClassLabel(index: number): string {
  const lower = DENSITY_BREAKS[index - 1];
  const upper = DENSITY_BREAKS[index];
  if (lower === undefined) return `< ${upper}`;
  if (upper === undefined) return `> ${lower}`;
  return `${lower}–${upper}`;
}
