import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearDevParams,
  exportDevParams,
  getDevParam,
  listDevParams,
  registerDevParam,
  resetAllDevParams,
  resetDevParam,
  setDevParam,
} from '@/dev/dev-params';

function makeParam(id: string, initial = 0.5) {
  let value = initial;
  const set = vi.fn((v: number) => {
    value = v;
  });
  const unregister = registerDevParam({
    id,
    label: id,
    group: 'test',
    min: 0,
    max: 1,
    step: 0.1,
    get: () => value,
    set,
  });
  return { set, unregister, read: () => value };
}

describe('dev params registry', () => {
  beforeEach(() => clearDevParams());

  it('calls the module setter and clamps to min/max', () => {
    const p = makeParam('a');
    expect(setDevParam('a', 0.8)).toBe(0.8);
    expect(setDevParam('a', 5)).toBe(1);
    expect(setDevParam('a', -5)).toBe(0);
    expect(p.set).toHaveBeenLastCalledWith(0);
  });

  it('ignores unknown ids and non-finite values', () => {
    const p = makeParam('a');
    expect(setDevParam('nope', 1)).toBeUndefined();
    expect(setDevParam('a', Number.NaN)).toBeUndefined();
    expect(p.set).not.toHaveBeenCalled();
  });

  it('resets to the value captured at registration', () => {
    const p = makeParam('a', 0.3);
    const q = makeParam('b', 0.7);
    setDevParam('a', 0.9);
    setDevParam('b', 0.1);
    resetDevParam('a');
    expect(p.read()).toBe(0.3);
    expect(q.read()).toBe(0.1);
    resetAllDevParams();
    expect(q.read()).toBe(0.7);
  });

  it('exports current values keyed by id', () => {
    makeParam('a', 0.3);
    makeParam('b', 0.7);
    setDevParam('a', 0.4);
    expect(exportDevParams()).toEqual({ a: 0.4, b: 0.7 });
    expect(getDevParam('b')).toBe(0.7);
  });

  it('replaces a param with the same id and unregisters only the current one', () => {
    const first = makeParam('a');
    const second = makeParam('a');
    expect(listDevParams()).toHaveLength(1);
    first.unregister();
    expect(listDevParams()).toHaveLength(1);
    second.unregister();
    expect(listDevParams()).toHaveLength(0);
  });
});
