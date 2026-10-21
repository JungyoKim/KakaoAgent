<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let { ref = $bindable(null), class: className, ...restProps }: AlertDialogPrimitive.CancelProps = $props();
</script>

<!-- iOS alert button: the same capsule as the action, in the plain text color. -->
<AlertDialogPrimitive.Cancel
	bind:ref
	data-slot="alert-dialog-cancel"
	class={cn("inline-flex h-11 min-w-0 items-center justify-center rounded-full bg-card px-4 text-[0.9375rem] outline-none transition-colors select-none focus-visible:ring-3 focus-visible:ring-ring/30 active:bg-muted disabled:pointer-events-none disabled:opacity-50 font-medium text-foreground", className)}
	{...restProps}
/>

