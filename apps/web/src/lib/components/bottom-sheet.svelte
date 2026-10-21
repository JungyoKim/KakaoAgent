<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/icon.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Drawer from '$lib/components/ui/drawer';
	import { trackScrollbar } from '$lib/scrollbar';
	import { cn } from '$lib/utils';

	let {
		open = $bindable(false),
		onOpenChange,
		title,
		showTitle = true,
		size = 'auto',
		children
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Shown in the top row with the close button, or only to screen readers with showTitle off. */
		title: string;
		showTitle?: boolean;
		/** auto: as tall as the content, up to 88% of the screen; large: always 88%, like the action library. */
		size?: 'auto' | 'large';
		children: Snippet;
	} = $props();
</script>

<!--
	The phones' sheet, drawn like the action library: rising from the bottom with the same corners and
	grabber, following the finger (drag it down to close), the title and a close button on top, and
	the content scrolling to the bottom edge, its end clear of the home indicator. Nothing takes focus
	when it opens, so no keyboard pops up over it.
-->
<Drawer.Root bind:open {onOpenChange}>
	<Drawer.Content
		data-grouped
		showHandle={false}
		class={cn(
			'p-0 before:rounded-[2.25rem] before:border-0 before:bg-background data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[88%] sm:mx-auto sm:max-w-2xl',
			size === 'large' && 'h-[88%]'
		)}
		onOpenAutoFocus={(event) => event.preventDefault()}
	>
		<div class="flex min-h-0 flex-1 flex-col gap-3 px-4">
			<div aria-hidden="true" class="-mb-3 flex h-5 shrink-0 items-center justify-center">
				<span class="h-1 w-9 rounded-full bg-muted-foreground/40"></span>
			</div>
			{#if showTitle}
				<div class="flex shrink-0 items-center gap-2">
					<Drawer.Title class="min-w-0 flex-1 truncate pl-1 text-xl font-bold">{title}</Drawer.Title>
					<Button
						variant="glass"
						size="icon"
						aria-label="닫기"
						onclick={() => {
							open = false;
							onOpenChange?.(false);
						}}
					>
						<Icon name="xmark" class="size-5" />
					</Button>
				</div>
			{:else}
				<Drawer.Title class="sr-only">{title}</Drawer.Title>
			{/if}
			<div
				{@attach trackScrollbar}
				class="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pt-1 pr-edge-4 pb-[calc(--spacing(4)+env(safe-area-inset-bottom))] pl-4"
			>
				{@render children()}
			</div>
		</div>
	</Drawer.Content>
</Drawer.Root>
