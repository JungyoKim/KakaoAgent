<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { Toaster } from 'svelte-sonner';
	import { theme } from '$lib/theme.svelte';
</script>

<Toaster
	theme={theme.value}
	position="top-center"
	offset={{ top: 'calc(var(--inset-top) + 1rem)' }}
	mobileOffset={{ top: 'calc(var(--inset-top) + 1rem)' }}
	class="toaster group"
	style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border); --border-radius: var(--radius);"
>
	<!-- iOS system colors: green for done, blue for information, orange for warnings, red for errors. -->
	{#snippet successIcon()}<Icon name="checkmark_circle_fill" class="size-5 text-(--switch-on)" />{/snippet}
	{#snippet infoIcon()}<Icon name="info_circle_fill" class="size-5 text-primary" />{/snippet}
	{#snippet warningIcon()}<Icon name="exclamationmark_triangle_fill" class="size-5 text-[#ff9500] dark:text-[#ff9f0a]" />{/snippet}
	{#snippet errorIcon()}<Icon name="xmark_circle_fill" class="size-5 text-destructive" />{/snippet}
	{#snippet loadingIcon()}<Icon name="slowmo" class="size-5 animate-spin text-muted-foreground" />{/snippet}
</Toaster>
