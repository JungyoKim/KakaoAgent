<script lang="ts">
	import type { AgentTurnDto, RoomDto, SystemStatus } from '@kakao-agent/shared';
	import Icon from '$lib/components/icon.svelte';
	import NodeIcon from '$lib/components/node-icon.svelte';
	import Page from '$lib/components/page.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { dateTime, timeAgo } from '$lib/format';
	import { ROOM_KIND_ICON, ROOM_KIND_LABEL } from '$lib/labels';
	import { currentUser } from '$lib/me.svelte';
	import { useQuery } from '$lib/query.svelte';

	const me = $derived(currentUser());
	const owner = $derived(me.role === 'owner');
	const status = useQuery<SystemStatus>(() => '/system/status', { interval: 20_000 });
	const rooms = useQuery<RoomDto[]>(() => '/rooms');
	const turns = useQuery<AgentTurnDto[]>(() => (owner ? '/agent/turns?limit=5' : null), { interval: 15_000 });

	const CARD = 'rounded-[1.625rem] bg-card';
	const HEADER = 'px-4 text-xs font-semibold text-muted-foreground';
	const ROW = 'flex min-h-13 items-center gap-3 border-b pl-4 last:border-b-0';
	const ROW_BODY = 'flex min-w-0 flex-1 items-center justify-between gap-3 pr-4';

	const connected = $derived(status.data?.iris.connected ?? false);
	const sending = $derived.by(() => {
		if (!status.data) return '';
		if (status.data.paused) return '일시 정지';
		if (status.data.sendMode !== 'live') return '연습 모드';
		return status.data.sendRooms ? status.data.sendRooms.join(', ') : '모든 방';
	});
</script>

{#snippet row(icon: string, color: string, label: string, value: string, tone?: 'good' | 'bad')}
	<div class={ROW}>
		<NodeIcon {icon} {color} />
		<span class={ROW_BODY}>
			<span class="truncate text-sm font-medium">{label}</span>
			<span
				class="truncate text-sm text-muted-foreground data-[tone=bad]:text-destructive data-[tone=good]:text-emerald-600 dark:data-[tone=good]:text-emerald-400"
				data-tone={tone}
			>
				{value}
			</span>
		</span>
	</div>
{/snippet}

<!-- The bot at a glance: its KakaoTalk connection, today's traffic, and the rooms it listens to. -->
<Page title="홈" class="max-w-2xl">
	<section class="flex flex-col gap-2">
		<h2 class={HEADER}>상태</h2>
		{#if status.data}
			<div class="{CARD} flex flex-col overflow-hidden">
				{@render row('antenna_radiowaves_left_right', connected ? 'green' : 'red', '카카오톡 연결', connected ? '연결됨' : '끊김', connected ? 'good' : 'bad')}
				{@render row('clock_fill', 'blue', '마지막 메시지', timeAgo(status.data.iris.lastEventAt))}
				{@render row('bubble_left_bubble_right_fill', 'yellow', '오늘 받은 메시지', `${status.data.counts.messagesToday}개`)}
				{#if owner}
					{@render row('paperplane_fill', 'indigo', '보낼 수 있는 방', sending, status.data.paused ? 'bad' : undefined)}
				{/if}
			</div>
		{:else}
			<Skeleton class="h-40 rounded-[1.625rem]" />
		{/if}
	</section>

	<section class="flex flex-col gap-2">
		<h2 class={HEADER}>방</h2>
		{#if !rooms.data}
			<Skeleton class="h-26 rounded-[1.625rem]" />
		{:else if rooms.data.length}
			<div class="{CARD} flex flex-col overflow-hidden">
				{#each rooms.data as room (room.id)}
					{@render row(
						ROOM_KIND_ICON[room.kind ?? 'other'] ?? ROOM_KIND_ICON.other,
						room.enabled ? 'yellow' : 'gray',
						room.name,
						room.enabled ? ROOM_KIND_LABEL[room.kind ?? 'other'] : '꺼짐'
					)}
				{/each}
			</div>
		{:else if owner}
			<a
				href="/settings/rooms"
				class="{CARD} flex min-h-13 items-center gap-3 pl-4 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30 active:bg-muted"
			>
				<NodeIcon icon="plus" color="yellow" />
				<span class={ROW_BODY}>
					<span class="truncate text-sm font-medium">방 등록하기</span>
					<Icon name="chevron_right" class="size-4 text-muted-foreground/70" />
				</span>
			</a>
		{:else}
			<p class="px-4 text-sm text-muted-foreground">아직 볼 수 있는 방이 없어요</p>
		{/if}
	</section>

	{#if owner}
		<section class="flex flex-col gap-2">
			<h2 class={HEADER}>최근 /bot 대화</h2>
			{#if turns.data?.length}
				<div class="{CARD} flex flex-col overflow-hidden">
					{#each turns.data as turn (turn.id)}
						<div class="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0">
							<p class="text-sm font-medium break-words">{turn.sender}: {turn.question}</p>
							{#if turn.answer}
								<p class="line-clamp-4 text-sm break-words whitespace-pre-line text-muted-foreground">{turn.answer}</p>
							{/if}
							{#if turn.error}
								<p class="text-xs text-destructive">{turn.error}</p>
							{/if}
							<p class="text-xs text-muted-foreground/80">
								{turn.room} · {dateTime(turn.createdAt)} · {(turn.ms / 1000).toFixed(1)}초{turn.tools.length ? ` · ${turn.tools.join(', ')}` : ''}{turn.model ? ` · ${turn.model}` : ''}
							</p>
						</div>
					{/each}
				</div>
			{:else}
				<p class="px-4 text-sm text-muted-foreground">카카오톡에서 /bot 뒤에 질문을 적으면 여기에 기록돼요</p>
			{/if}
		</section>
	{/if}
</Page>
