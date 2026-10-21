<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		value = $bindable(''),
		placeholder = '검색',
		tag,
		class: className,
		...restProps
	}: Omit<HTMLInputAttributes, 'value' | 'type'> & {
		value?: string;
		/** A filter shown as a gray tag at the start of the field, with its own clear button. */
		tag?: { label: string; onclear: () => void };
	} = $props();
</script>

<!-- iOS search field: a gray capsule with a magnifier, an optional filter tag, and a clear button once there is text. -->
<label class={cn('flex h-(--h-control) min-w-0 items-center gap-2 rounded-full bg-muted px-3.5 text-muted-foreground', className)}>
	<Icon name="search" class="size-[1.125rem] shrink-0" />
	{#if tag}
		<span class="flex h-7 shrink-0 items-center gap-1 rounded-full bg-muted-foreground/20 pr-1 pl-2.5 text-sm font-medium text-foreground">
			{tag.label}
			<button
				type="button"
				aria-label="{tag.label} 필터 지우기"
				onclick={tag.onclear}
				class="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:opacity-60"
			>
				<Icon name="xmark" class="size-3" />
			</button>
		</span>
	{/if}
	<input
		bind:value
		type="search"
		{placeholder}
		class="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
		{...restProps}
	/>
	{#if value}
		<button
			type="button"
			aria-label="지우기"
			onclick={() => (value = '')}
			class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/60 text-card"
		>
			<Icon name="xmark" class="size-3" />
		</button>
	{/if}
</label>
