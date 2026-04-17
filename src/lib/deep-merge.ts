function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge<T>(base: T, override: Partial<T>): T {
  if (Array.isArray(base) || Array.isArray(override)) {
    return (override ?? base) as T;
  }

  if (!isObject(base) || !isObject(override)) {
    return (override ?? base) as T;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    if (isObject(baseValue) && isObject(value)) {
      merged[key] = deepMerge(baseValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged as T;
}