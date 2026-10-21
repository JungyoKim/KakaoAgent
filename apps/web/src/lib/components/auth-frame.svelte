<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card';

	let { title, description, children }: { title: string; description?: string; children?: Snippet } = $props();
</script>

<div
	class="flex h-app items-center justify-center overflow-y-auto bg-background px-4 pt-[max(1rem,var(--inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
>
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="items-center text-center">
			<img src="/logo.svg" alt="" class="mx-auto mb-2 size-14 rounded-2xl shadow-sm" />
			<Card.Title class="text-xl">{title}</Card.Title>
			{#if description}
				<Card.Description>{description}</Card.Description>
			{/if}
		</Card.Header>
		{#if children}
			<Card.Content>{@render children()}</Card.Content>
		{/if}
	</Card.Root>
</div>

