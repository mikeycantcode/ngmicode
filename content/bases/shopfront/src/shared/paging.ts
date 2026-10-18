import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "../config";
import { ValidationError } from "./errors";

export interface Page<T> {
  items: T[];
  total: number;
  /** 1-based */
  page: number;
  pageSize: number;
}

/**
 * Normalizes paging input. Pages are 1-based. Missing values get defaults;
 * pageSize is clamped to PAGE_SIZE_MAX. Non-integer or < 1 values are a
 * ValidationError (we used to silently default them, which hid client bugs).
 */
export function normalizePaging(page?: number, pageSize?: number): { page: number; pageSize: number } {
  const p = page ?? 1;
  const s = pageSize ?? PAGE_SIZE_DEFAULT;
  if (!Number.isInteger(p) || p < 1) throw new ValidationError("page must be an integer >= 1");
  if (!Number.isInteger(s) || s < 1) throw new ValidationError("pageSize must be an integer >= 1");
  return { page: p, pageSize: Math.min(s, PAGE_SIZE_MAX) };
}

export function paginate<T>(items: T[], page?: number, pageSize?: number): Page<T> {
  const n = normalizePaging(page, pageSize);
  const start = (n.page - 1) * n.pageSize;
  return { items: items.slice(start, start + n.pageSize), total: items.length, page: n.page, pageSize: n.pageSize };
}
