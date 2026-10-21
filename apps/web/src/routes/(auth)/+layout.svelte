<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import FullPageSpinner from '$lib/components/full-page-spinner.svelte';
	import { useMe } from '$lib/me.svelte';

	let { children } = $props();

	// Every page in here needs an account; without one the login page takes over and comes back.
	const auth = useMe();

	$effect(() => {
		if (auth.me === null) void goto(`/login?next=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
	});
</script>

{#if auth.me}
	{@render children()}
{:else if auth.error && auth.me === undefined}
	<div class="flex h-app items-center justify-center p-6 text-sm text-muted-foreground">{auth.error}</div>
{:else}
	<FullPageSpinner />
{/if}
