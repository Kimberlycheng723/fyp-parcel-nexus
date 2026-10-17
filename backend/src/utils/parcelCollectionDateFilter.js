export function validateCollectionDateFilter(filters = {}) {
  const result = {};
  for (const key of ["collected_from", "collected_to"]) {
    if (filters[key] === undefined) continue;
    const value = filters[key];
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return { error: "INVALID_COLLECTION_DATE_FILTER" };
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return { error: "INVALID_COLLECTION_DATE_FILTER" };
    result[key] = value;
  }
  if (result.collected_from && result.collected_to && result.collected_from > result.collected_to) return { error: "INVALID_COLLECTION_DATE_FILTER" };
  return result;
}
