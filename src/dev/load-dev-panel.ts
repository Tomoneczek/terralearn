import type { GlobeContext } from '@/globe';
import { parseSkyTimeParam } from '@/globe/sky-clock';
import { isDevMode } from './dev-mode';

type DevModule = typeof import('./index');

/**
 * Loads the dev panel only when `?dev=true` is present, and applies the dev-only `?time=`.
 * The panel lives in a separate chunk (dynamic import), so regular visitors never download it.
 */
export async function loadDevPanel(
  search: string,
  root: HTMLElement,
  context: GlobeContext,
  importer: () => Promise<DevModule> = () => import('./index'),
): Promise<void> {
  if (!isDevMode(search)) return;
  // `?time=2026-08-12T17:46:00Z` freezes the sky at an instant (eclipses, phases)
  const fixedTime = parseSkyTimeParam(search);
  if (fixedTime) context.skyClock.setFixedTime(fixedTime);
  try {
    const mod = await importer();
    mod.initDevPanel(root, context);
  } catch (err) {
    console.warn('[TerraLearn] Dev panel failed to load:', err);
  }
}
