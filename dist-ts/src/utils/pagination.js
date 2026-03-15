"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginate = paginate;
function paginate(items, limit = 20, offset = 0) {
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
//# sourceMappingURL=pagination.js.map