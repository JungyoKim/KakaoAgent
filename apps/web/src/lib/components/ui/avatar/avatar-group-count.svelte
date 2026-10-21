<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="avatar-group-count"
	class={cn(
		"bg-muted text-muted-foreground size-8 rounded-full text-sm group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>.f7]:size-4 group-has-data-[size=lg]/avatar-group:[&>.f7]:size-5 group-has-data-[size=sm]/avatar-group:[&>.f7]:size-3 relative flex shrink-0 items-center justify-center ring-2 ring-background",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
