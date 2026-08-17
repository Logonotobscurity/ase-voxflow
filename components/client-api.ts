'use client';

/**
 * Client-side API helper for the /app surfaces.
 *
 * In demo runtime mode the platform's demo identity defaults apply
 * (tenant_demo / actor_ada / BUILDER) when no identity headers are sent,
 * so these fetches work without spoofing headers. The helper surfaces a
 * stable error envelope so pages can render their error state.
 */
export type ApiEnvelope<T> = { data: T; persistence?: string };

export type ApiFailure = { error?: { code?: string; message?: string } };

export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiFailure;
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? `Request failed (${response.status})`);
    (error as Error & { code?: string }).code = payload.error?.code ?? 'REQUEST_FAILED';
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload.data;
}
