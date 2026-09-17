export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SortOrder = "asc" | "desc";

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type FacetValue = { value: string; count: number };
