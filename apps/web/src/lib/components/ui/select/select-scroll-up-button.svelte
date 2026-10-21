<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SelectPrimitive.ScrollUpButtonProps> = $props();
</script>

<SelectPrimitive.ScrollUpButton
	bind:ref
	data-slot="select-scroll-up-button"
	class={cn("bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_.f7:not([class*='size-'])]:size-4", className)}
	{...restProps}
>
	<Icon name="chevron_up" />
</SelectPrimitive.ScrollUpButton>
