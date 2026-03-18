import type { ResponseFormat } from '../types';

export function formatResponse<T>(data: T, markdownText: string, format: ResponseFormat): string {
  return format === 'json' ? JSON.stringify(data, null, 2) : markdownText;
}