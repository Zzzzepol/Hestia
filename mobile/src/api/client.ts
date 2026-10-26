export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type ClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
};

export function createApiClient({ baseUrl, getAccessToken, fetcher = fetch }: ClientOptions) {
  const root = baseUrl.replace(/\/$/, '');
  if (!/^https:\/\//.test(root) && !(__DEV__ && /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/.test(root))) {
    throw new Error('API base URL must use HTTPS.');
  }

  return {
    async request<T>(path: `/v1/${string}`, options: RequestOptions = {}): Promise<T> {
      if (!path.startsWith('/v1/') || path.startsWith('/v1//')) {
        throw new Error('Invalid API path.');
      }
      const method = options.method ?? 'GET';
      if (method !== 'GET' && !options.idempotencyKey) {
        throw new Error('Mutations require an idempotency key.');
      }

      const token = await getAccessToken();
      if (!token) throw new ApiError('Sign in is required.', 401, 'AUTH_REQUIRED');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? (method === 'GET' ? 20_000 : 30_000));
      const onAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const response = await fetcher(root + path, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });

        const raw = response.status === 204 ? '' : await response.text();
        let payload: unknown;
        try {
          payload = raw ? JSON.parse(raw) as unknown : undefined;
        } catch {
          payload = undefined;
        }
        if (!response.ok) {
          const error = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
          throw new ApiError(
            typeof error.message === 'string' ? error.message : 'Request failed.',
            response.status,
            typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
          );
        }
        return payload as T;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (controller.signal.aborted) throw new ApiError('Request timed out or was cancelled.', 0, 'ABORTED');
        throw new ApiError('Connection unavailable. Try again.', 0, 'NETWORK_ERROR');
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
