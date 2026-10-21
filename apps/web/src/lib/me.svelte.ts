import type { Me } from '@kakao-agent/shared';
import { post } from './api';
import { clearQueries, peekQuery, useQuery } from './query.svelte';

export const ME_PATH = '/auth/me';

/**
 * The signed-in account: undefined while loading, null when signed out. Only the auth layout
 * waits on this; pages under it use currentUser().
 */
export function useMe() {
	const query = useQuery<Me>(() => ME_PATH, { maxAge: 60_000 });
	return {
		get me(): Me | null | undefined {
			if (query.status === 401) return null;
			return query.data;
		},
		get error() {
			return query.status === 401 ? null : query.error;
		}
	};
}

/** The signed-in account, for pages inside the auth layout (which only renders them once it is known). */
export function currentUser(): Me {
	const me = peekQuery<Me>(ME_PATH);
	if (!me) throw new Error('currentUser() is only available inside the auth layout');
	return me;
}

export async function logout(): Promise<void> {
	await post('/auth/logout');
	clearQueries();
	window.location.href = '/login';
}
