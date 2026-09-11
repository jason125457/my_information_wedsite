export type FetchImplementation = typeof fetch;

export class CollectorHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(`Collector request failed with HTTP ${status} (${endpoint}).`);
    this.name = "CollectorHttpError";
  }
}

export async function fetchJson<T>(
  fetchImplementation: FetchImplementation,
  input: string | URL,
  init: RequestInit,
  endpoint: string,
) {
  const response = await fetchImplementation(input, init);
  if (!response.ok) throw new CollectorHttpError(response.status, endpoint);
  return (await response.json()) as T;
}

export async function fetchText(
  fetchImplementation: FetchImplementation,
  input: string | URL,
  init: RequestInit,
  endpoint: string,
) {
  const response = await fetchImplementation(input, init);
  if (!response.ok) throw new CollectorHttpError(response.status, endpoint);
  return response.text();
}
