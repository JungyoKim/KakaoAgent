<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { page } from '$app/state';
	import { TABS } from '$lib/nav';

	const path = $derived(page.url.pathname);
	const isCurrent = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

	/** Tapping the tab you are on scrolls its page back to the top, like iOS. */
	function reselect(event: MouseEvent, href: string) {
		if (path !== href) return;
		event.preventDefault();
		window.dispatchEvent(new CustomEvent('tab-reselect', { detail: href }));
	}
</script>

<!-- Phone navigation, iOS style: a tab bar along the bottom edge in place of the sidebar. -->
<nav aria-label="메뉴" data-tab-bar class="shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden">
	<div class="mx-auto flex h-14 max-w-md">
		{#each TABS as tab (tab.href)}
			<a
				href={tab.href}
				aria-current={isCurrent(tab.href) ? 'page' : undefined}
				onclick={(event) => reselect(event, tab.href)}
				class="flex flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted-foreground outline-none transition-transform select-none focus-visible:text-foreground active:scale-90 aria-[current=page]:text-sidebar-primary"
			>
				<!-- The tab you are on shows the filled version of its icon, as iOS does. -->
				<Icon name={isCurrent(tab.href) ? `${tab.icon}_fill` : tab.icon} class="size-6" />
				{tab.label}
			</a>
		{/each}
	</div>
</nav>
