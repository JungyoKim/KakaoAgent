<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	let {
		href,
		disabled,
		class: className,
		children
	}: { href: string; disabled?: boolean; class?: string; children: Snippet } = $props();
</script>

<!-- Kakao's login button colors: #FEE500 background, black symbol, 85% black label. -->
<Button
	size="lg"
	{disabled}
	class={cn('w-full bg-[#FEE500] text-black/85 hover:bg-[#FEE500]/90 active:bg-[#FEE500]/80', className)}
	onclick={() => window.location.assign(href)}
>
	<svg viewBox="0 0 24 24" aria-hidden="true" data-icon="inline-start" class="size-5 text-black">
		<path
			fill="currentColor"
			d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.65 1.74 4.97 4.37 6.3l-.9 3.3c-.08.3.26.54.52.37l3.9-2.58c.52.07 1.06.11 1.61.11 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5Z"
		/>
	</svg>
	{@render children()}
</Button>
