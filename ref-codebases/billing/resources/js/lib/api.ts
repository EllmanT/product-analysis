const API_PREFIX = '/api';

function getXsrfToken(): string | null {
    const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const xsrf = getXsrfToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');
    if (xsrf) {
        headers.set('X-XSRF-TOKEN', xsrf);
    }
    if (init.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    return fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers,
    });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await apiFetch(path, init);
    const text = await res.text();

    if (!res.ok) {
        let b: { message?: string; errors?: Record<string, string[]> } = {};
        try {
            b = text ? (JSON.parse(text) as typeof b) : {};
        } catch {
            /* ignore */
        }
        const msg =
            typeof b.message === 'string'
                ? b.message
                : b.errors
                  ? Object.values(b.errors)
                        .flat()
                        .join(' ')
                  : `Request failed (${res.status})`;
        throw new Error(msg);
    }

    if (res.status === 204 || !text) {
        return undefined as T;
    }

    const body: unknown = JSON.parse(text);
    if (body !== null && typeof body === 'object' && 'data' in body) {
        return (body as { data: T }).data;
    }

    return body as T;
}

/** Session JSON API under `/api` (subscriptions + read-only plans/products). */
export function apiUrl(path: string): string {
    return path.startsWith('http') ? path : `${API_PREFIX}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Same JSON + CSRF conventions, but routes on the web stack (no `/api` prefix). */
export function webUrl(path: string): string {
    if (path.startsWith('http')) {
        return path;
    }
    return path.startsWith('/') ? path : `/${path}`;
}
