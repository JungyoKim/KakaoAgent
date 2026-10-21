<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';

	let { name, image, class: className }: { name: string; image?: string | null; class?: string } = $props();
</script>

<Avatar.Root class={className}>
	{#if image}
		<Avatar.Image src={image} alt="" referrerpolicy="no-referrer" />
	{/if}
	<Avatar.Fallback>{name.slice(0, 1)}</Avatar.Fallback>
</Avatar.Root>
