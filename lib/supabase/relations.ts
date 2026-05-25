export function normalizeRelation<T>(
  relation: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

export function normalizeRelationArray<T>(
  relation: T | T[] | null | undefined,
): T[] {
  if (!relation) return [];
  return Array.isArray(relation) ? relation : [relation];
}
