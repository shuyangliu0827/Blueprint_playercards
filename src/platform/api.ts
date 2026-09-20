export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error ?? 'NETWORK', data.message ?? '暂时连接不上，请重试');
  return data as T;
}
