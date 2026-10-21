<script lang="ts">
	import Icon from './icon.svelte';
	import { nodeStyle } from '$lib/colors';
	import { cn } from '$lib/utils';

	let {
		icon,
		color,
		size = 'md',
		class: className
	}: { icon: string; color: string; size?: 'sm' | 'md' | 'lg'; class?: string } = $props();
</script>

<!-- Rounded colored square with a node icon, like the action glyphs in Shortcuts. -->
<span
	class={cn(
		'inline-flex shrink-0 items-center justify-center',
		size === 'sm' && 'size-5 rounded-md [&_.f7]:size-3',
		size === 'md' && 'size-7 rounded-lg [&_.f7]:size-4',
		size === 'lg' && 'size-10 rounded-xl [&_.f7]:size-5',
		className
	)}
	style={nodeStyle(color)}
>
	<Icon name={icon} />
</span>

