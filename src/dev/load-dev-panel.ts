import type { GlobeContext } from '@/globe';
import { isDevMode } from './dev-mode';

type DevModule = typeof import('./index');

/**
 * Loads the dev panel only when `?dev=true` is present. The panel lives in a separate
 * chunk (dynamic import), so regular visitors never download it.
 */
export async function loadDevPanel(
  search: string,
  root: HTMLElement,
  context: GlobeContext,
  importer: () => Promise<DevModule> = () => import('./index'),
): Promise<void> {
  if (!isDevMode(search)) return;
  try {
    const mod = await importer();
    mod.initDevPanel(root, context);
  } catch (err) {
    console.warn('[TerraLearn] Dev panel failed to load:', err);
  }
}
