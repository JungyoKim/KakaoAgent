<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let { name, class: className, ...rest }: { name: string } & HTMLAttributes<HTMLElement> = $props();
</script>

<!--
	A Framework7 icon by its own name (framework7.io/icons), such as "trash" or "bell_fill": the
	icon font turns the name into its glyph, the way Framework7 itself draws them on iOS. The name is
	CSS content (layout.css), so it never shows up as the element's text. The icon is 24px until a
	class or its container sets a size, and takes the text color.
-->
<i
	data-slot="icon"
	data-f7={name}
	aria-hidden={rest['aria-label'] ? undefined : 'true'}
	class={cn('f7 shrink-0', className)}
	{...rest}
></i>

