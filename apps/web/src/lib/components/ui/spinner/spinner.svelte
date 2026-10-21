<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon from '$lib/components/icon.svelte';
	import { cn } from '$lib/utils.js';

	let { class: className, role = 'status', 'aria-label': ariaLabel = 'Loading', ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<Icon name="slowmo" {role} aria-label={ariaLabel} class={cn('size-4 animate-spin', className)} {...restProps} />

