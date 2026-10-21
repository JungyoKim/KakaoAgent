<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children: childrenProp,
		...restProps
	}: WithoutChild<DropdownMenuPrimitive.RadioItemProps> = $props();
</script>

<DropdownMenuPrimitive.RadioItem
	bind:ref
	data-slot="dropdown-menu-radio-item"
	class={cn(
		"focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground gap-2.5 rounded-2xl py-2 pr-3 pl-9 text-sm font-medium max-md:py-2.5 max-md:pr-4 max-md:pl-10 [&_.f7:not([class*='size-'])]:size-4 relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_.f7]:pointer-events-none [&_.f7]:shrink-0",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span
			class="absolute left-3 flex items-center justify-center pointer-events-none max-md:left-3.5"
			data-slot="dropdown-menu-radio-item-indicator"
		>
			{#if checked}
				<Icon name="checkmark_alt" />
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</DropdownMenuPrimitive.RadioItem>
