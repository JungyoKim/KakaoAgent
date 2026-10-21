<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import type { ButtonVariant } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		...restProps
	}: AlertDialogPrimitive.ActionProps & {
		variant?: ButtonVariant;
	} = $props();
</script>

<!-- iOS alert button: a capsule beside 취소; a destructive action is told apart by its red label. -->
<AlertDialogPrimitive.Action
	bind:ref
	data-slot="alert-dialog-action"
	class={cn(
		"inline-flex h-11 min-w-0 items-center justify-center rounded-full bg-card px-4 text-[0.9375rem] outline-none transition-colors select-none focus-visible:ring-3 focus-visible:ring-ring/30 active:bg-muted disabled:pointer-events-none disabled:opacity-50 font-semibold",
		variant === "destructive" ? "text-destructive" : "text-primary",
		className
	)}
	{...restProps}
/>

