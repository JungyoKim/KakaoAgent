<script lang="ts" module>
	/** Scroll position per page, kept across tab switches like a native tab bar. */
	const positions = new Map<string, number>();
</script>

<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { narrow } from '$lib/media.svelte';
	import { cn } from '$lib/utils';

	let {
		title,
		description,
		actions,
		back,
		children,
		class: className
	}: {
		title: string;
		description?: string;
		actions?: Snippet;
		/** Phone-only back link, for pages reached from another page rather than the tab bar. */
		back?: { href: string; label: string };
		children: Snippet;
		class?: string;
	} = $props();

	let scroller = $state<HTMLDivElement>();
	let largeTitle = $state<HTMLDivElement>();
	let scrolled = $state(false);
	// Without a back link the phone bar only appears once scrolled, so it floats over the content.
	const floating = $derived(!back);
	const inlineActions = $derived(narrow.current && floating && !scrolled);
	const key = page.url.pathname;

	/*
	 * On phones the title starts large at the top of the content, iOS style, and moves into the bar
	 * once it has scrolled away. Top-level pages show no bar at all until then: their actions sit on
	 * the large title's row, and the bar fades in over the content, taking the actions with it.
	 */
	$effect(() => {
		if (!scroller || !largeTitle) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				const top = entry.rootBounds?.top ?? 0;
				scrolled = !entry.isIntersecting && entry.boundingClientRect.height > 0 && entry.boundingClientRect.top < top;
			},
			{ root: scroller }
		);
		observer.observe(largeTitle);
		return () => observer.disconnect();
	});

	$effect(() => {
		const element = scroller;
		if (!element) return;
		element.scrollTop = positions.get(key) ?? 0;
		const onReselect = (event: Event) => {
			if ((event as CustomEvent<string>).detail === key) element.scrollTo({ top: 0, behavior: 'smooth' });
		};
		window.addEventListener('tab-reselect', onReselect);
		return () => {
			positions.set(key, element.scrollTop);
			window.removeEventListener('tab-reselect', onReselect);
		};
	});
</script>

<!-- Standard page frame: a title bar with actions; only the content below it scrolls. -->
<div class="relative flex min-h-0 flex-1 flex-col">
	<!-- Phones: the status bar keeps a plain background while the content scrolls under it. -->
	<div aria-hidden="true" class="h-(--inset-top) shrink-0 bg-background md:hidden"></div>
	<header
		data-scrolled={scrolled || undefined}
		class={cn(
			'group/bar flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 max-md:not-data-scrolled:border-transparent md:px-6',
			floating &&
				'max-md:absolute max-md:inset-x-0 max-md:top-(--inset-top) max-md:z-10 max-md:transition-opacity max-md:not-data-scrolled:pointer-events-none max-md:not-data-scrolled:opacity-0'
		)}
	>
		{#if back}
			<Button href={back.href} variant="ghost" class="-ml-3 gap-0.5 pl-1.5 md:hidden">
				<Icon name="chevron_left" class="size-5" />
				{back.label}
			</Button>
		{/if}
		<h1 class="truncate text-base font-semibold transition-opacity max-md:not-group-data-scrolled/bar:opacity-0">{title}</h1>
		{#if !inlineActions && actions}
			<div class="ml-auto flex items-center gap-2">{@render actions()}</div>
		{/if}
	</header>
	<!-- On wide screens the page sits in a card with rounded corners; the scrollbar stops above them. -->
	<div bind:this={scroller} class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:scrollbar-inset-b-2xl">
		<div class={cn('mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-8', className)}>
			<!-- Control height even after the actions move to the bar, so the content never shifts. -->
			<div
				bind:this={largeTitle}
				class={cn('-mb-2 flex items-center gap-2 md:hidden', actions && floating && 'min-h-(--h-control)')}
			>
				<p aria-hidden="true" class={cn('min-w-0 flex-1 text-3xl font-bold tracking-tight max-md:text-[2.125rem] max-md:leading-[2.5625rem]', inlineActions && 'truncate')}>
					{title}
				</p>
				{#if inlineActions && actions}
					<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
				{/if}
			</div>
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
			{@render children()}
		</div>
	</div>
</div>

