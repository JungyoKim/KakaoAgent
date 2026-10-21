import { untrack } from 'svelte';
import { api, ApiError, errorMessage } from './api';

/**
 * A tiny query cache keyed by API path. Answers stay for the whole session, so a page opened
 * again shows its last data at once and reloads in the background. invalidate() reloads every
 * path under a prefix, like react-query's key prefixes ('/shortcuts' also covers '/shortcuts/1').
 */
export interface Query<T> {
	data: T | undefined;
	error: string | null;
	status: number | null;
	loading: boolean;
	/** When the last answer arrived; 0 means never or marked stale. */
	at: number;
}

interface Options {
	/** How long an answer counts as fresh, in ms. */
	maxAge?: number;
	/** Reload every this many ms while in use and the page is visible. */
	interval?: number;
}

/*
 * One reactive store created with the module, so reading a path that has no entry yet still
 * subscribes to it. (State created while a component renders is not tracked by that render.)
 * Entries are only added outside of reads: in useQuery's effect, refresh and setQueryData.
 */
const store: Record<string, Query<unknown>> = $state({});
const users = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();

function entry<T>(path: string): Query<T> {
	if (!store[path]) store[path] = { data: undefined, error: null, status: null, loading: false, at: 0 };
	return store[path] as Query<T>;
}

export function refresh(path: string): Promise<void> {
	const running = inflight.get(path);
	if (running) return running;
	const q = entry(path);
	q.loading = true;
	const work = (async () => {
		try {
			q.data = await api(path);
			q.error = null;
			q.status = 200;
		} catch (error) {
			q.error = errorMessage(error);
			q.status = error instanceof ApiError ? error.status : null;
		} finally {
			q.at = Date.now();
			q.loading = false;
			inflight.delete(path);
		}
	})();
	inflight.set(path, work);
	return work;
}

/**
 * Reads a path for as long as the calling component lives. The path can change (or be null to
 * wait); the result is a live view of the cache entry.
 */
export function useQuery<T>(path: () => string | null, options: Options = {}): Query<T> {
	const key = $derived(path());
	$effect(() => {
		const current = key;
		if (!current) return;
		users.set(current, (users.get(current) ?? 0) + 1);
		untrack(() => {
			const q = entry(current);
			if (!q.loading && (q.at === 0 || Date.now() - q.at > (options.maxAge ?? 0))) void refresh(current);
		});
		const timer = options.interval
			? setInterval(() => document.visibilityState === 'visible' && void refresh(current), options.interval)
			: undefined;
		return () => {
			users.set(current, (users.get(current) ?? 1) - 1);
			clearInterval(timer);
		};
	});
	const current = () => (key ? (store[key] as Query<T> | undefined) : undefined);
	return {
		get data() {
			return current()?.data;
		},
		get error() {
			return current()?.error ?? null;
		},
		get status() {
			return current()?.status ?? null;
		},
		get loading() {
			const q = current();
			return key !== null && (!q || q.loading || q.at === 0);
		},
		get at() {
			return current()?.at ?? 0;
		}
	};
}

/** Reloads every cached path under the given prefixes that is on screen; the rest reload when next used. */
export function invalidate(...prefixes: string[]): Promise<void> {
	const work: Promise<void>[] = [];
	for (const path of Object.keys(store)) {
		if (!prefixes.some((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?'))) continue;
		store[path]!.at = 0;
		if ((users.get(path) ?? 0) > 0) work.push(refresh(path));
	}
	return Promise.all(work).then(() => undefined);
}

/** Puts an answer in the cache, e.g. the saved version a mutation returned. */
export function setQueryData<T>(path: string, data: T | ((current: T | undefined) => T)): void {
	const q = entry<T>(path);
	q.data = typeof data === 'function' ? (data as (current: T | undefined) => T)(q.data) : data;
	q.error = null;
	q.status = 200;
	q.at = Date.now();
}

/** The cached answer for a path, without loading it. */
export function peekQuery<T>(path: string): T | undefined {
	return store[path]?.data as T | undefined;
}

/** Drops every cached answer (after logging out). */
export function clearQueries(): void {
	for (const q of Object.values(store)) {
		q.data = undefined;
		q.at = 0;
	}
}
