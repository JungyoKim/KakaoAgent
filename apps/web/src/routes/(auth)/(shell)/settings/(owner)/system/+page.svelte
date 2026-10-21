<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { DEFAULT_LIMITS, type AuditEntry, type Limits, type SystemStatus } from '@kakao-agent/shared';
	import Page from '$lib/components/page.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import * as Table from '$lib/components/ui/table';
	import { errorMessage, post, put } from '$lib/api';
	import { dateTime, timeAgo } from '$lib/format';
	import { invalidate, useQuery } from '$lib/query.svelte';
	import { cn } from '$lib/utils';

	const AUDIT_LABEL: Record<string, string> = {
		login: '로그인',
		join: '카카오로 가입',
		'account.kakao-link': '카카오 계정 연결',
		'room.create': '방 등록',
		'room.update': '방 수정',
		'room.delete': '방 삭제',
		'user.update': '멤버 수정',
		'user.delete': '멤버 삭제',
		'system.pause': '전체 일시 정지',
		'system.resume': '다시 시작',
		'system.limits': '보내기 한도 변경',
		'name.alias': '표시 이름 변경',
		'setup.owner': '방장 계정 만듦'
	};

	const status = useQuery<SystemStatus>(() => '/system/status', { interval: 20_000 });
	const audit = useQuery<AuditEntry[]>(() => '/audit?limit=200');
	let confirmPause = $state(false);
	let limitsDraft = $state<Limits | null>(null);
	const limits = $derived(limitsDraft ?? status.data?.limits ?? null);

	async function setPaused(paused: boolean) {
		try {
			await post('/system/pause', { paused });
			toast.success(paused ? '봇을 멈췄어요' : '다시 시작했어요');
			await invalidate('/system/status', '/audit');
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	async function putLimits(next: Limits) {
		limitsDraft = next;
		try {
			await put('/system/limits', next);
			toast.success('한도를 저장했어요');
			await invalidate('/system/status', '/audit');
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			limitsDraft = null;
		}
	}

	/** A limit saves as soon as its field is left (or Enter is pressed), like the editor's autosave. */
	async function saveLimits() {
		if (!limitsDraft || !status.data) return;
		const changed = LIMIT_FIELDS.some((f) => limitsDraft![f.key] !== status.data!.limits[f.key]);
		if (!changed) {
			limitsDraft = null;
			return;
		}
		await putLimits(limitsDraft);
	}

	/** Each limit's number before it was turned off, so turning it back on brings the same number back. */
	const remembered: Partial<Record<keyof Limits, number>> = {};

	/** A limit's switch: off lets that many messages through without a cap (saved as null). */
	function setLimitOn(key: keyof Limits, on: boolean) {
		if (!limits) return;
		const current = limits[key];
		if (!on && current !== null) remembered[key] = current;
		void putLimits({ ...limits, [key]: on ? (remembered[key] ?? DEFAULT_LIMITS[key]) : null });
	}

	const LIMIT_FIELDS: { key: keyof Limits; label: string; max: number; unit?: string }[] = [
		{ key: 'roomPerMinute', label: '방마다 1분에 보낼 메시지', max: 60 },
		{ key: 'globalPerMinute', label: '전체 1분에 보낼 메시지', max: 300 }
	];
</script>

{#snippet stat(label: string, value: string, tone?: 'good' | 'bad')}
	<Card.Root size="sm">
		<Card.Header>
			<Card.Description>{label}</Card.Description>
			<Card.Title
				class={cn('text-xl', tone === 'good' && 'text-emerald-600 dark:text-emerald-400', tone === 'bad' && 'text-destructive')}
			>
				{value}
			</Card.Title>
		</Card.Header>
	</Card.Root>
{/snippet}

<Page title="시스템" back={{ href: '/settings', label: '설정' }}>
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		{@render stat('카카오톡 연결', status.data?.iris.connected ? '연결됨' : '끊김', status.data?.iris.connected ? 'good' : 'bad')}
		{@render stat('마지막 이벤트', timeAgo(status.data?.iris.lastEventAt))}
		{@render stat('오늘 받은 메시지', `${status.data?.counts.messagesToday ?? 0}개`)}
		{@render stat('보내기', status.data?.sendMode === 'live' ? '실제로 보냄' : '연습 모드')}
	</div>

	{#if status.data?.sendRooms}
		<div class="flex min-h-14 items-center gap-3 rounded-[1.625rem] bg-card px-4 py-2">
			<span class="min-w-0 flex-1 text-sm font-medium">보낼 수 있는 방</span>
			<span class="truncate text-sm text-muted-foreground">{status.data.sendRooms.join(', ')}</span>
		</div>
	{/if}

	<!--
		iOS settings rows: the pause switch at the end of its row, and each limit with its number.
		The switch only shows the server's state: turning it on asks first, and it turns on once
		멈추기 is pressed (취소 leaves it off).
	-->
	<div class="flex min-h-14 items-center gap-3 rounded-[1.625rem] bg-card py-2 pr-4 pl-4">
		<span id="pause-all-label" class="min-w-0 flex-1 text-sm font-medium">봇 일시 정지</span>
		<Switch
			aria-labelledby="pause-all-label"
			bind:checked={() => status.data?.paused ?? false, (on) => (on ? (confirmPause = true) : setPaused(false))}
		/>
	</div>

	<!-- The padding sits inside each row, so the hairlines between rows run from edge to edge of the card. -->
	<div class="flex flex-col rounded-[1.625rem] bg-card">
		{#each LIMIT_FIELDS as field (field.key)}
			{@const on = limits?.[field.key] !== null}
			<div class="flex min-h-13 items-center gap-2.5 border-b px-4 last:border-b-0">
				<span id="{field.key}-label" class="min-w-0 flex-1 text-sm break-keep">{field.label}</span>
				{#if on}
					<!-- A unit sits inside the field, after the number. -->
					<span class={cn('relative shrink-0', field.unit ? 'w-20' : 'w-16')}>
						<Input
							id={field.key}
							aria-labelledby="{field.key}-label"
							type="number"
							inputmode="numeric"
							min={1}
							max={field.max}
							class={cn('w-full px-3 text-center', field.unit && 'pr-7 text-right')}
							value={limits?.[field.key] ?? ''}
							oninput={(event) => limits && (limitsDraft = { ...limits, [field.key]: Number(event.currentTarget.value) })}
							onchange={saveLimits}
						/>
						{#if field.unit}
							<span aria-hidden="true" class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{field.unit}</span>
						{/if}
					</span>
				{:else}
					<span class="shrink-0 text-sm text-muted-foreground">제한 없음</span>
				{/if}
				<Switch
					aria-label="{field.label} 제한"
					bind:checked={() => on, (next) => setLimitOn(field.key, next)}
				/>
			</div>
		{/each}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>활동 기록</Card.Title>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<Table.Root aria-label="활동 기록">
				<Table.Header>
					<Table.Row>
						<Table.Head>때</Table.Head>
						<Table.Head>누가</Table.Head>
						<Table.Head>무엇을</Table.Head>
						<Table.Head class="hidden md:table-cell">대상</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each audit.data ?? [] as entry (entry.id)}
						<Table.Row>
							<Table.Cell class="whitespace-nowrap text-muted-foreground">{dateTime(entry.at)}</Table.Cell>
							<Table.Cell>{entry.user}</Table.Cell>
							<Table.Cell>{AUDIT_LABEL[entry.action] ?? entry.action}</Table.Cell>
							<Table.Cell class="hidden max-w-64 truncate text-muted-foreground md:table-cell">{entry.target ?? ''}</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={4}>
								<p class="py-8 text-center text-sm text-muted-foreground">아직 기록이 없어요</p>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	<AlertDialog.Root bind:open={confirmPause}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>봇을 멈출까요?</AlertDialog.Title>
				<AlertDialog.Description>다시 켤 때까지 봇이 아무 메시지도 보내지 않아요. KakaoBot의 삭제·수정 알림은 그대로 동작해요.</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>취소</AlertDialog.Cancel>
				<AlertDialog.Action variant="destructive" onclick={() => ((confirmPause = false), setPaused(true))}>멈추기</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</Page>
