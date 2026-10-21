<script lang="ts">
	import 'framework7-icons/css/framework7-icons.css';
	import './layout.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import PwaStatus from '$lib/components/pwa-status.svelte';
	import Toaster from '$lib/components/toaster.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { narrow } from '$lib/media.svelte';
	import { watchTheme } from '$lib/theme.svelte';

	let { children } = $props();

	onMount(() => {
		// iOS only shows :active pressed styles once the page listens for touches.
		const noop = () => {};
		document.addEventListener('touchstart', noop, { passive: true });
		// Keyboard focus rings: on after Tab, off again with the next tap or click (see layout.css).
		const root = document.documentElement;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Tab') root.dataset.keyboard = '';
		};
		const onPointer = () => delete root.dataset.keyboard;
		window.addEventListener('keydown', onKey, true);
		window.addEventListener('pointerdown', onPointer, true);
		const stopTheme = watchTheme();
		return () => {
			document.removeEventListener('touchstart', noop);
			window.removeEventListener('keydown', onKey, true);
			window.removeEventListener('pointerdown', onPointer, true);
			stopTheme();
		};
	});

	/** 1 for pages pushed on top of a tab page (settings pages), 0 for the tab pages. */
	const level = (path: string) => (path.startsWith('/settings/') ? 1 : 0);
	const inShell = (routeId: string | null | undefined) => !!routeId?.includes('/(shell)');

	/*
	 * Page changes animate with the View Transitions API. On phones pushed pages slide in from the
	 * right and back out to it; everything else cross-fades quickly. The tab bar stays put when both
	 * pages have it. History swipes (popstate) are left alone: Safari already animates those.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition || navigation.type === 'popstate' || navigation.willUnload) return;
		const from = navigation.from?.url.pathname ?? '/';
		const to = navigation.to?.url.pathname ?? '/';
		if (from === to) return;
		const root = document.documentElement;
		root.dataset.nav = !narrow.current ? 'fade' : level(to) > level(from) ? 'forward' : level(to) < level(from) ? 'back' : 'fade';
		if (inShell(navigation.from?.route.id) && inShell(navigation.to?.route.id)) root.dataset.tabBar = 'keep';
		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => {
				delete root.dataset.nav;
				delete root.dataset.tabBar;
			});
		});
	});
</script>

<!--
	Phones: the plain page background across the top inset (see --inset-top in layout.css), where
	iOS blurs the top edge of a home-screen app. Content starts below it, so the blur only ever
	covers this solid color. It is also an opaque fixed element on that edge, which is what WebKit
	looks for to tint the edge instead of blurring it. Dialogs and sheets (z-50) cover it.
-->
<div aria-hidden="true" class="fixed inset-x-0 top-0 z-40 hidden h-(--inset-top) bg-background phone:block [view-transition-name:top-strip]"></div>
<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
<Toaster />
<PwaStatus />
