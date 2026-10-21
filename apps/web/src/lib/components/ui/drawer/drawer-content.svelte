<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";
	import { cn } from "$lib/utils.js";
	import type { WithoutChildrenOrChild } from "$lib/utils.js";
	import DrawerOverlay from "./drawer-overlay.svelte";
	import DrawerPortal from "./drawer-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		showHandle = true,
		children,
		...restProps
	}: DrawerPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DrawerPortal>>;
		/** The stock grab handle; a drawer that draws its own turns it off. */
		showHandle?: boolean;
	} = $props();
</script>

<DrawerPortal {...portalProps}>
	<DrawerOverlay />
	<DrawerPrimitive.Content
		bind:ref
		data-slot="drawer-content"
		class={cn(
			"before:bg-popover before:border-border relative flex h-auto flex-col bg-transparent p-4 text-sm before:absolute before:inset-2 before:-z-10 before:rounded-4xl before:border before:shadow-xl data-[vaul-drawer-direction=bottom]:pb-0 data-[vaul-drawer-direction=bottom]:before:inset-x-0 data-[vaul-drawer-direction=bottom]:before:top-0 data-[vaul-drawer-direction=bottom]:before:bottom-0 data-[vaul-drawer-direction=bottom]:before:rounded-b-none data-[vaul-drawer-direction=bottom]:before:border-x-0 data-[vaul-drawer-direction=bottom]:before:border-b-0 group/drawer-content fixed z-50 data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[85svh] data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:start-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:end-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
			className
		)}
		{...restProps}
	>
		{#if showHandle}
			<div
				class="bg-muted mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full mx-auto hidden shrink-0 group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
			></div>
		{/if}
		{@render children?.()}
	</DrawerPrimitive.Content>
</DrawerPortal>

