<script lang="ts">
	import type { MessageHit, RoomDto, RoomStats } from '@kakao-agent/shared';
	import ChoiceSelect from '$lib/components/choice-select.svelte';
	import Icon from '$lib/components/icon.svelte';
	import Page from '$lib/components/page.svelte';
	import SearchField from '$lib/components/search-field.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { dateTime } from '$lib/format';
	import { useQuery } from '$lib/query.svelte';
	import { cn } from '$lib/utils';

	const PERIODS = [
		{ days: '1', label: '오늘' },
		{ days: '7', label: '7일' },
		{ days: '30', label: '30일' },
		{ days: '0', label: '전체' }
	];

	const rooms = useQuery<RoomDto[]>(() => '/rooms');
	let picked = $state<string | null>(null);
	let days = $state('7');
	const roomId = $derived(
		picked ?? (rooms.data?.find((room) => room.kind === 'group' && room.enabled) ?? rooms.data?.[0])?.id ?? null
	);

	// While a room's past messages are still being copied, the numbers refresh every few seconds.
	let syncing = $state(false);
	const stats = useQuery<RoomStats>(() => (roomId ? `/rooms/${roomId}/stats?days=${days}` : null), {
		get interval() {
			return syncing ? 4000 : 60_000;
		}
	});
	$effect(() => {
		syncing = stats.data ? !stats.data.sync.done : false;
	});

	let query = $state('');
	let debounced = $state('');
	let person = $state<{ userId: string; name: string } | null>(null);
	$effect(() => {
		const next = query.trim();
		const timer = setTimeout(() => (debounced = next), 300);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		void roomId;
		person = null;
	});
	const searchPath = $derived.by(() => {
		if (!roomId || (!debounced && !person)) return null;
		const params = new URLSearchParams({ limit: '50' });
		if (debounced) params.set('q', debounced);
		if (person) params.set('userId', person.userId);
		return `/rooms/${roomId}/messages?${params}`;
	});
	const hits = useQuery<MessageHit[]>(() => searchPath, { maxAge: 30_000 });

	const maxPerson = $derived(Math.max(1, ...(stats.data?.people.map((p) => p.count) ?? [1])));
	const maxHour = $derived(Math.max(1, ...(stats.data?.hours ?? [1])));
	const recentDays = $derived((stats.data?.days ?? []).slice(-31));
	const maxDay = $derived(Math.max(1, ...recentDays.map((d) => d.count)));
	const perDay = $derived.by(() => {
		const data = stats.data;
		if (!data || !data.total) return 0;
		const span = days === '0' ? Math.max(1, data.days.length) : Number(days);
		return Math.round(data.total / span);
	});
	const number = (value: number) => value.toLocaleString('ko-KR');

	const CARD = 'rounded-[1.625rem] bg-card';
	const HEADER = 'px-4 text-xs font-semibold text-muted-foreground';
</script>

{#snippet figure(label: string, value: string)}
	<div class="{CARD} flex flex-col gap-1 px-4 py-3">
		<span class="text-xs text-muted-foreground">{label}</span>
		<span class="text-xl font-semibold tabular-nums">{value}</span>
	</div>
{/snippet}

<!-- One room at a time: who talks, when, and a search over its messages. -->
<Page title="통계" class="max-w-3xl">
	{#if rooms.data && rooms.data.length === 0}
		<p class="px-4 text-sm text-muted-foreground">볼 수 있는 방이 아직 없어요</p>
	{:else}
		<div class="flex flex-wrap items-center gap-3">
			<ChoiceSelect
				aria-label="방"
				class="min-w-0 flex-1 sm:max-w-64"
				items={(rooms.data ?? []).map((room) => ({ id: room.id, label: room.name }))}
				value={roomId}
				onchange={(id) => (picked = id)}
			/>
			<Tabs.Root bind:value={days}>
				<Tabs.List>
					{#each PERIODS as period (period.days)}
						<Tabs.Trigger value={period.days}>{period.label}</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</Tabs.Root>
		</div>

		{#if stats.data && !stats.data.sync.done}
			<div class="{CARD} flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
				<Spinner />
				<span>지난 메시지를 가져오는 중이에요 · {number(stats.data.sync.stored)}개</span>
			</div>
		{/if}

		{#if !stats.data}
			<Skeleton class="h-24 rounded-[1.625rem]" />
			<Skeleton class="h-64 rounded-[1.625rem]" />
		{:else}
			<div class="grid grid-cols-3 gap-3">
				{@render figure('메시지', `${number(stats.data.total)}개`)}
				{@render figure('참여한 사람', `${stats.data.people.length}명`)}
				{@render figure('하루 평균', `${number(perDay)}개`)}
			</div>

			<section class="flex flex-col gap-2">
				<h2 class={HEADER}>많이 말한 사람</h2>
				{#if stats.data.people.length}
					<div class="{CARD} flex flex-col overflow-hidden">
						{#each stats.data.people.slice(0, 10) as p, i (p.userId)}
							<button
								type="button"
								onclick={() => (person = { userId: p.userId, name: p.name })}
								class="relative flex min-h-12 items-center gap-3 border-b px-4 text-left outline-none transition-colors last:border-b-0 focus-visible:bg-muted/60 active:bg-muted"
							>
								<span
									aria-hidden="true"
									class="absolute inset-y-1.5 left-1.5 rounded-xl bg-primary/10"
									style="width: calc({(p.count / maxPerson) * 100}% - 0.75rem)"
								></span>
								<span class="relative w-5 shrink-0 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
								<span class="relative min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
								<span class="relative shrink-0 text-sm text-muted-foreground tabular-nums">{number(p.count)}</span>
							</button>
						{/each}
					</div>
				{:else}
					<p class="px-4 text-sm text-muted-foreground">이 기간에는 메시지가 없어요</p>
				{/if}
			</section>

			<section class="flex flex-col gap-2">
				<h2 class={HEADER}>시간대</h2>
				<div class="{CARD} px-4 pt-4 pb-3">
					<div class="flex h-28 items-end gap-[3px]" role="img" aria-label="시간대별 메시지 수">
						{#each stats.data.hours as count, hour (hour)}
							<div class="flex h-full flex-1 items-end" title="{hour}시 · {number(count)}개">
								<div class="w-full rounded-t-[3px] bg-primary/80" style="height: {Math.max(count ? 3 : 0, (count / maxHour) * 100)}%"></div>
							</div>
						{/each}
					</div>
					<div class="mt-1.5 flex justify-between text-[0.6875rem] text-muted-foreground tabular-nums">
						<span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span>
					</div>
				</div>
			</section>

			{#if recentDays.length > 1}
				<section class="flex flex-col gap-2">
					<h2 class={HEADER}>날짜{days === '0' ? ' (최근 31일)' : ''}</h2>
					<div class="{CARD} px-4 pt-4 pb-3">
						<div class="flex h-24 items-end gap-[3px]" role="img" aria-label="날짜별 메시지 수">
							{#each recentDays as day (day.date)}
								<div class="flex h-full flex-1 items-end" title="{day.date} · {number(day.count)}개">
									<div class="w-full rounded-t-[3px] bg-primary/60" style="height: {Math.max(3, (day.count / maxDay) * 100)}%"></div>
								</div>
							{/each}
						</div>
						<div class="mt-1.5 flex justify-between text-[0.6875rem] text-muted-foreground tabular-nums">
							<span>{recentDays[0]?.date.slice(5).replace('-', '.')}</span>
							<span>{recentDays.at(-1)?.date.slice(5).replace('-', '.')}</span>
						</div>
					</div>
				</section>
			{/if}
		{/if}

		<section class="flex flex-col gap-2">
			<h2 class={HEADER}>메시지 찾기</h2>
			<SearchField
				bind:value={query}
				placeholder="단어로 찾기"
				tag={person ? { label: person.name, onclear: () => (person = null) } : undefined}
			/>
			{#if searchPath}
				{#if !hits.data}
					<div class="flex justify-center py-6"><Spinner /></div>
				{:else if hits.data.length}
					<div class="{CARD} flex flex-col overflow-hidden">
						{#each hits.data as hit (hit.logId)}
							<div class="flex flex-col gap-0.5 border-b px-4 py-2.5 last:border-b-0">
								<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
									<span class="font-medium text-foreground">{hit.name}</span>
									<span>{dateTime(hit.at)}</span>
									{#if hit.kind !== '텍스트'}<span>· {hit.kind}</span>{/if}
								</span>
								<p class={cn('text-sm break-words whitespace-pre-line', !hit.text && 'text-muted-foreground')}>
									{hit.text || '(내용 없음)'}
								</p>
							</div>
						{/each}
					</div>
				{:else}
					<p class="flex items-center gap-2 px-4 text-sm text-muted-foreground">
						<Icon name="search" class="size-4" />찾은 메시지가 없어요
					</p>
				{/if}
			{/if}
		</section>
	{/if}
</Page>
