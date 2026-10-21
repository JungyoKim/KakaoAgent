<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { page } from '$app/state';
	import UserAvatar from './user-avatar.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { currentUser, logout } from '$lib/me.svelte';
	import { MAIN_NAV, OWNER_NAV, isActive } from '$lib/nav';
	import { setTheme, theme } from '$lib/theme.svelte';

	const me = $derived(currentUser());
	const sidebar = Sidebar.useSidebar();
	const themes = [
		{ id: 'light', label: '밝게', icon: 'sun_max' },
		{ id: 'dark', label: '어둡게', icon: 'moon' },
		{ id: 'system', label: '시스템 설정 따르기', icon: 'desktopcomputer' }
	] as const;
</script>

{#snippet nav(items: typeof MAIN_NAV)}
	{#each items as item (item.href)}
		<Sidebar.MenuItem>
			<Sidebar.MenuButton isActive={isActive(page.url.pathname, item.href)}>
				{#snippet child({ props })}
					<a href={item.href} {...props} onclick={() => sidebar.setOpenMobile(false)}>
						<Icon name={item.icon} />
						<span>{item.label}</span>
					</a>
				{/snippet}
			</Sidebar.MenuButton>
		</Sidebar.MenuItem>
	{/each}
{/snippet}

<Sidebar.Root variant="inset" class="pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
	<Sidebar.Header>
		<div class="flex items-center gap-2.5 px-2 py-1.5">
			<img src="/logo.svg" alt="" class="size-8 rounded-lg" />
			<span class="font-semibold">봇</span>
		</div>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>{@render nav(MAIN_NAV)}</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
		{#if me.role === 'owner'}
			<Sidebar.Group>
				<Sidebar.GroupLabel>방장 설정</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>{@render nav(OWNER_NAV)}</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/if}
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex h-auto w-full items-center justify-start gap-2.5 rounded-2xl px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=open]:bg-muted"
					>
						<UserAvatar name={me.displayName} image={me.kakao?.image} class="size-8" />
						<span class="flex min-w-0 flex-1 flex-col items-start leading-tight">
							<span class="truncate text-sm font-medium">{me.displayName}</span>
							<span class="flex items-center gap-1 text-xs text-muted-foreground">
								{#if me.role === 'owner'}
									<Icon name="checkmark_shield" class="size-3" />
								{/if}
								{me.role === 'owner' ? '방장' : '멤버'}
							</span>
						</span>
						<Icon name="ellipsis" class="size-4 text-muted-foreground" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="top" align="start" class="w-56">
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a href="/settings/account" {...props}>
									<Icon name="person" />내 계정
								</a>
							{/snippet}
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Label>화면</DropdownMenu.Label>
						{#each themes as t (t.id)}
							<DropdownMenu.Item onSelect={() => setTheme(t.id)}>
								<Icon name={t.icon} />{t.label}{theme.value === t.id ? ' ✓' : ''}
							</DropdownMenu.Item>
						{/each}
						<DropdownMenu.Separator />
						<DropdownMenu.Item variant="destructive" onSelect={logout}>
							<Icon name="square_arrow_right" />로그아웃
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>
