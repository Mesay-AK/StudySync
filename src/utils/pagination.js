// Shared bounds for query-string pagination params. Without this, callers
// can pass an unbounded `limit` (large result sets / memory pressure) or a
// zero/negative `page` (silently treated as page 1 by Mongo's skip, instead
// of being rejected as invalid input).
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export const clampPagination = (page, limit) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  return { page: parsedPage, limit: parsedLimit, skip: (parsedPage - 1) * parsedLimit };
};
