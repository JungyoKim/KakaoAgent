<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import TabBar from '$lib/components/tab-bar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';

	let { children } = $props();
</script>

<!--
	The window never scrolls; only the main panel's content does (see Page). On phones the page runs
	edge to edge: Page pads its header below the status bar and the tab bar pads itself above the
	home indicator, so nothing leaves an empty strip at the top or bottom.
-->
<Sidebar.Provider
	class="h-app min-h-0 overflow-hidden pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] md:pt-[env(safe-area-inset-top)] md:pb-[env(safe-area-inset-bottom)]"
>
	<AppSidebar />
	<Sidebar.Inset class="min-h-0 overflow-hidden">
		{@render children()}
		<TabBar />
	</Sidebar.Inset>
</Sidebar.Provider>
