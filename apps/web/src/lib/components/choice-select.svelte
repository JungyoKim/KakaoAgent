<script lang="ts" module>
	export interface Choice {
		id: string;
		label: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import { isIOS } from '$lib/platform';

	let {
		items,
		value,
		onchange,
		placeholder,
		class: className,
		'aria-label': ariaLabel
	}: {
		items: Choice[];
		value: string | null;
		onchange: (id: string) => void;
		placeholder?: string;
		class?: string;
		'aria-label': string;
	} = $props();

	const label = $derived(items.find((item) => item.id === value)?.label ?? placeholder ?? '선택');
</script>

<!-- One-of-many picker: the system's own menu on iPhone and iPad, the app's menu elsewhere. -->
{#if isIOS}
	<NativeSelect.Root
		aria-label={ariaLabel}
		value={value ?? ''}
		onchange={(event) => onchange(event.currentTarget.value)}
		class={className}
	>
		{#if !value}
			<NativeSelect.Option value="" disabled>{placeholder ?? '선택'}</NativeSelect.Option>
		{/if}
		{#each items as item (item.id)}
			<NativeSelect.Option value={item.id} disabled={item.disabled}>{item.label}</NativeSelect.Option>
		{/each}
	</NativeSelect.Root>
{:else}
	<Select.Root type="single" value={value ?? undefined} onValueChange={(next) => next && onchange(next)}>
		<Select.Trigger aria-label={ariaLabel} class={className}>
			<!-- A long choice ends in … instead of being cut off mid-letter. -->
			<span data-slot="select-value" class={value ? 'min-w-0' : 'min-w-0 text-muted-foreground'}>
				<span class="truncate">{label}</span>
			</span>
		</Select.Trigger>
		<Select.Content>
			{#each items as item (item.id)}
				<Select.Item value={item.id} label={item.label} disabled={item.disabled}>{item.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
{/if}
