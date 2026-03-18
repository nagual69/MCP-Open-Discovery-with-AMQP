import type { PaginatedResponse } from '../types';

export function paginate<T>(items: T[], limit = 20, offset = 0): PaginatedResponse<T> {
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    total_count: total,
    count: page.length,
    offset,
    limit,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
    items: page,
  };
}