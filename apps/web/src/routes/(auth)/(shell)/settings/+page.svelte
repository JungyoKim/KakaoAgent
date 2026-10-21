<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import NodeIcon from '$lib/components/node-icon.svelte';
	import Page from '$lib/components/page.svelte';
	import UserAvatar from '$lib/components/user-avatar.svelte';
	import { currentUser, logout } from '$lib/me.svelte';
	import { OWNER_NAV } from '$lib/nav';
	import { setTheme, theme, type Theme } from '$lib/theme.svelte';

	const me = $derived(currentUser());
	const owner = $derived(me.role === 'owner');
	const THEMES = [
		{ id: 'light', label: '밝게', icon: 'sun_max_fill', color: 'orange' },
		{ id: 'dark', label: '어둡게', icon: 'moon_fill', color: 'indigo' },
		{ id: 'system', label: '시스템 설정 따르기', icon: 'circle_lefthalf_fill', color: 'gray' }
	] as const;

	const CARD = 'rounded-[1.625rem] bg-card';
	const HEADER = 'px-4 text-xs font-semibold text-muted-foreground';
	/** One row of a grouped list: a colored glyph and the label, over a hairline from edge to edge of the card. */
	const ROW =
		'flex min-h-13 items-center gap-3 border-b pl-4 text-left outline-none transition-colors last:border-b-0 focus-visible:bg-muted/60 active:bg-muted';
	const ROW_BODY = 'flex min-w-0 flex-1 items-center justify-between gap-3 pr-4';
</script>

<!--
	The phone's settings tab, laid out like iOS Settings: the account card, then grouped lists whose
	rows all share one height and type size: the theme (a checkmark on the chosen one), the owner's
	pages, and 로그아웃 on its own.
-->
<Page title="설정" class="max-w-2xl">
	<a
		href="/settings/account"
		class="{CARD} flex items-center gap-3 px-4 py-3 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 active:bg-muted"
	>
		<UserAvatar name={me.displayName} image={me.kakao?.image} class="size-12" />
		<span class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-base font-semibold">{me.displayName}</span>
			<span class="text-sm text-muted-foreground max-md:text-[0.9375rem]">{owner ? '방장' : '멤버'}</span>
		</span>
		<Icon name="chevron_right" class="size-4 text-muted-foreground/70" />
	</a>

	<section class="flex flex-col gap-2">
		<h2 class={HEADER}>화면</h2>
		<div role="radiogroup" aria-label="화면" class="{CARD} flex flex-col overflow-hidden">
			{#each THEMES as t (t.id)}
				<button type="button" role="radio" aria-checked={theme.value === t.id} onclick={() => setTheme(t.id as Theme)} class={ROW}>
					<NodeIcon icon={t.icon} color={t.color} />
					<span class={ROW_BODY}>
						<span class="truncate text-sm font-medium">{t.label}</span>
						<!-- The iOS list checkmark is semibold: the glyph gets a thin outline of its own color. -->
						{#if theme.value === t.id}
							<Icon name="checkmark" class="size-[1.125rem] text-primary [&::before]:[-webkit-text-stroke:0.04em_currentColor]" />
						{/if}
					</span>
				</button>
			{/each}
		</div>
	</section>

	{#if owner}
		<section class="flex flex-col gap-2">
			<h2 class={HEADER}>방장 설정</h2>
			<nav aria-label="방장 설정" class="{CARD} flex flex-col overflow-hidden">
				{#each OWNER_NAV as item (item.href)}
					<a href={item.href} class={ROW}>
						<NodeIcon icon="{item.icon}_fill" color={item.color} />
						<span class={ROW_BODY}>
							<span class="truncate text-sm font-medium">{item.label}</span>
							<Icon name="chevron_right" class="size-4 text-muted-foreground/70" />
						</span>
					</a>
				{/each}
			</nav>
		</section>
	{/if}

	<button
		type="button"
		onclick={logout}
		class="{CARD} flex min-h-13 items-center justify-center text-sm font-medium text-destructive outline-none transition-colors focus-visible:ring-3 focus-visible:ring-destructive/20 active:bg-muted"
	>
		로그아웃
	</button>
</Page>

