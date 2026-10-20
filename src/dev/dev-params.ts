/**
 * Registry of live-tunable numeric parameters shown in the dev panel.
 * Modules register their own parameters, so the panel needs no knowledge of them.
 */
export interface DevParamDefinition {
  id: string;
  label: string;
  /** Section heading the slider is listed under. */
  group: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (value: number) => void;
}

interface RegisteredParam extends DevParamDefinition {
  defaultValue: number;
}

const params = new Map<string, RegisteredParam>();

function clamp(param: DevParamDefinition, value: number): number {
  return Math.min(param.max, Math.max(param.min, value));
}

/** Registers a parameter (replacing one with the same id); returns an unregister function. */
export function registerDevParam(definition: DevParamDefinition): () => void {
  const registered: RegisteredParam = { ...definition, defaultValue: definition.get() };
  params.set(definition.id, registered);
  return () => {
    if (params.get(definition.id) === registered) {
      params.delete(definition.id);
    }
  };
}

export function listDevParams(): readonly DevParamDefinition[] {
  return [...params.values()];
}

/** Applies a value clamped to the parameter range; returns the applied value. */
export function setDevParam(id: string, value: number): number | undefined {
  const param = params.get(id);
  if (!param || !Number.isFinite(value)) return undefined;
  const next = clamp(param, value);
  param.set(next);
  return next;
}

export function getDevParam(id: string): number | undefined {
  return params.get(id)?.get();
}

export function resetDevParam(id: string): void {
  const param = params.get(id);
  if (param) param.set(param.defaultValue);
}

export function resetAllDevParams(): void {
  for (const param of params.values()) param.set(param.defaultValue);
}

/** Current values keyed by id, ready to paste as new defaults. */
export function exportDevParams(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, param] of params) out[id] = param.get();
  return out;
}

export function clearDevParams(): void {
  params.clear();
}
