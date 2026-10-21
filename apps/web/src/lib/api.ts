export class ApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

/** JSON fetch against the kakao-agent API. Mutations carry the CSRF header the server requires. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
	const response = await fetch(`/api${path}`, {
		method: init.method ?? 'GET',
		headers: { 'Content-Type': 'application/json', 'X-Kakao-Agent': '1' },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
		credentials: 'same-origin'
	});
	const data = await response.json().catch(() => null);
	if (!response.ok) {
		const message = (data as { error?: string } | null)?.error ?? `요청에 실패했어요 (${response.status})`;
		throw new ApiError(message, response.status);
	}
	return data as T;
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : '알 수 없는 오류가 났어요';
}
