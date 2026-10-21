<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser } from '$lib/me.svelte';

	let { children } = $props();

	// Owner settings: members are sent back to the list.
	const owner = $derived(currentUser().role === 'owner');

	$effect(() => {
		if (!owner) void goto('/', { replaceState: true });
	});
</script>

{#if owner}
	{@render children()}
{/if}
