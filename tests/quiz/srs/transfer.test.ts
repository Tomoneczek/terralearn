import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createExportPayload,
  downloadExportFile,
  parseAndValidateImport,
  applyImportedData,
  EXPORT_SCHEMA_VERSION,
  type ProgressExportPayload,
} from '@/quiz/srs/transfer';
import { saveSrsState, loadSrsState, SRS_STORAGE_KEY } from '@/quiz/srs/persistence';
import { QUIZ_CONFIG_STORAGE_KEY } from '@/quiz/persistence';
import { STORAGE_KEY } from '@/state/persistence';
import { store } from '@/state';

describe('Progress & SRS Transfer (Export / Import)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('createExportPayload', () => {
    it('creates a valid export payload with schema version 1 and current timestamp', () => {
      saveSrsState({
        PL: {
          id: 'PL',
          box: 4,
          lastReviewed: 1700000000000,
          nextReview: 1700604800000,
          consecutiveCorrect: 3,
          totalAttempts: 3,
          successCount: 3,
        },
      });

      const payload = createExportPayload();
      expect(payload.version).toBe(EXPORT_SCHEMA_VERSION);
      expect(typeof payload.exportedAt).toBe('string');
      expect(payload.srs['PL']?.box).toBe(4);
      expect(payload.quizConfig).toBeDefined();
    });

    it('allows overriding payload contents for testing', () => {
      const payload = createExportPayload({
        srs: {
          FR: {
            id: 'FR',
            box: 5,
            lastReviewed: 100,
            nextReview: 200,
            consecutiveCorrect: 5,
            totalAttempts: 5,
            successCount: 5,
          },
        },
      });

      expect(payload.srs['FR']?.box).toBe(5);
      expect(payload.srs['PL']).toBeUndefined();
    });
  });

  describe('downloadExportFile', () => {
    it('creates a download link and triggers click', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const payload: ProgressExportPayload = {
        version: 1,
        exportedAt: '2026-10-17T12:00:00.000Z',
        srs: {},
      };

      downloadExportFile(payload);

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  describe('parseAndValidateImport', () => {
    it('rejects invalid JSON string syntax', () => {
      const res = parseAndValidateImport('{ invalid json');
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_json');
    });

    it('rejects non-object primitive inputs', () => {
      expect(parseAndValidateImport('null').error).toBe('schema_error');
      expect(parseAndValidateImport('"string"').error).toBe('schema_error');
      expect(parseAndValidateImport('123').error).toBe('schema_error');
    });

    it('rejects unsupported schema versions', () => {
      const payload = {
        version: 2,
        exportedAt: '2026-10-17T12:00:00.000Z',
        srs: {},
      };
      const res = parseAndValidateImport(JSON.stringify(payload));
      expect(res.success).toBe(false);
      expect(res.error).toBe('invalid_version');
    });

    it('rejects payloads with invalid SRS items (schema violation)', () => {
      const payload = {
        version: 1,
        exportedAt: '2026-10-17T12:00:00.000Z',
        srs: {
          PL: {
            id: 'PL',
            box: 99, // invalid: max is 5
          },
        },
      };
      const res = parseAndValidateImport(JSON.stringify(payload));
      expect(res.success).toBe(false);
      expect(res.error).toBe('schema_error');
    });

    it('successfully parses and counts valid payloads', () => {
      const payload: ProgressExportPayload = {
        version: 1,
        exportedAt: '2026-10-17T12:00:00.000Z',
        srs: {
          PL: {
            id: 'PL',
            box: 5,
            lastReviewed: 1000,
            nextReview: 2000,
            consecutiveCorrect: 4,
            totalAttempts: 4,
            successCount: 4,
          },
          DE: {
            id: 'DE',
            box: 1,
            lastReviewed: 1000,
            nextReview: 1000,
            consecutiveCorrect: 0,
            totalAttempts: 1,
            successCount: 0,
          },
        },
        appState: {
          theme: 'classic',
          knowledgeMap: true,
        },
        quizConfig: {
          mode: 'reverse',
          category: 'rivers',
          continent: 'europe',
          difficulty: 'hard',
          questionCount: 15,
        },
      };

      const res = parseAndValidateImport(JSON.stringify(payload));
      expect(res.success).toBe(true);
      expect(res.itemCount).toBe(2);
      expect(res.data?.srs['PL']?.box).toBe(5);
      expect(res.data?.appState?.theme).toBe('classic');
      expect(res.data?.quizConfig?.mode).toBe('reverse');
    });
  });

  describe('applyImportedData', () => {
    it('applies imported SRS, appState, and quizConfig and dispatches events', () => {
      const srsUpdatedListener = vi.fn();
      const progressImportedListener = vi.fn();
      window.addEventListener('tl-srs-updated', srsUpdatedListener);
      window.addEventListener('tl-progress-imported', progressImportedListener);

      const payload: ProgressExportPayload = {
        version: 1,
        exportedAt: '2026-10-17T12:00:00.000Z',
        srs: {
          IT: {
            id: 'IT',
            box: 5,
            lastReviewed: 5000,
            nextReview: 99999,
            consecutiveCorrect: 5,
            totalAttempts: 5,
            successCount: 5,
          },
        },
        appState: {
          theme: 'classic',
          knowledgeMap: true,
        },
        quizConfig: {
          mode: 'reverse',
          category: 'mountains',
          continent: 'asia',
          difficulty: 'easy',
          questionCount: 5,
        },
      };

      applyImportedData(payload);

      // Verify SRS in localStorage
      const srs = loadSrsState();
      expect(srs['IT']?.box).toBe(5);

      // Verify localStorage persistence keys
      expect(localStorage.getItem(SRS_STORAGE_KEY)).toBeTruthy();
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
      expect(localStorage.getItem(QUIZ_CONFIG_STORAGE_KEY)).toBeTruthy();

      // Verify store updated
      expect(store.get().theme).toBe('classic');
      expect(store.get().knowledgeMap).toBe(true);

      // Verify event dispatches
      expect(srsUpdatedListener).toHaveBeenCalled();
      expect(progressImportedListener).toHaveBeenCalled();

      window.removeEventListener('tl-srs-updated', srsUpdatedListener);
      window.removeEventListener('tl-progress-imported', progressImportedListener);
    });
  });
});
