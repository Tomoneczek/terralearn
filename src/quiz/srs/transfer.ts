import { z } from 'zod';
import { SrsStateSchema, loadSrsState, saveSrsState } from './persistence';
import {
  PersistedStateSchema,
  loadPersistedState,
  savePersistedState,
  applyPersistedState,
  type PersistedState,
} from '@/state/persistence';
import { QuizConfigSchema, loadLastQuizConfig, saveLastQuizConfig } from '@/quiz/persistence';
import { store } from '@/state';
import type { QuizConfig } from '@/quiz/types';
import type { SrsState } from './types';

export const EXPORT_SCHEMA_VERSION = 1;

export const ProgressExportSchema = z.object({
  version: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string(),
  srs: SrsStateSchema,
  appState: PersistedStateSchema.optional(),
  quizConfig: QuizConfigSchema.optional(),
});

export type ProgressExportPayload = z.infer<typeof ProgressExportSchema>;

export type ValidationErrorType = 'invalid_json' | 'invalid_version' | 'schema_error';

export interface ValidationResult {
  success: boolean;
  data?: ProgressExportPayload;
  error?: ValidationErrorType;
  itemCount?: number;
}

/**
 * Creates a complete snapshot payload of the user's progress and settings.
 */
export function createExportPayload(overrides?: {
  srs?: SrsState;
  appState?: PersistedState;
  quizConfig?: QuizConfig;
}): ProgressExportPayload {
  const srs = overrides?.srs ?? loadSrsState();
  const appState = overrides?.appState ?? loadPersistedState() ?? undefined;
  const quizConfig = overrides?.quizConfig ?? loadLastQuizConfig();

  return {
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    srs,
    appState,
    quizConfig,
  };
}

/**
 * Triggers a client-side file download of the export JSON payload.
 */
export function downloadExportFile(payload: ProgressExportPayload = createExportPayload()): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `terralearn-progress-${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Parses and validates an imported JSON string against the ProgressExportSchema.
 */
export function parseAndValidateImport(jsonString: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return {
      success: false,
      error: 'invalid_json',
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      success: false,
      error: 'schema_error',
    };
  }

  const record = parsed as Record<string, unknown>;
  if (record['version'] !== EXPORT_SCHEMA_VERSION) {
    return {
      success: false,
      error: 'invalid_version',
    };
  }

  const validated = ProgressExportSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      success: false,
      error: 'schema_error',
    };
  }

  const itemCount = Object.keys(validated.data.srs).length;
  return {
    success: true,
    data: validated.data,
    itemCount,
  };
}

/**
 * Applies validated imported data to localStorage and application state.
 */
export function applyImportedData(payload: ProgressExportPayload): void {
  // 1. Save SRS state (this also dispatches 'tl-srs-updated')
  saveSrsState(payload.srs);

  // 2. Save Quiz Config if present
  if (payload.quizConfig) {
    saveLastQuizConfig(payload.quizConfig);
  }

  // 3. Save & apply AppState if present
  if (payload.appState) {
    const current = store.get();
    const updated = applyPersistedState(current, payload.appState);
    store.set(updated);
    savePersistedState(updated);
  }

  // 4. Dispatch a custom event to notify components that progress was imported
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tl-progress-imported', {
        detail: {
          srsCount: Object.keys(payload.srs).length,
          exportedAt: payload.exportedAt,
        },
      }),
    );
  }
}
