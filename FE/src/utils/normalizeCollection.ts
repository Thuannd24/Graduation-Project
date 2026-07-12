export function normalizeCollection<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.content)) return record.content as T[];
    if (Array.isArray(record.items)) return record.items as T[];
  }
  return [];
}
