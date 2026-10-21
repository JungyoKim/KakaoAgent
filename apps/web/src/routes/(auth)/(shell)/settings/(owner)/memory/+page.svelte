<script lang="ts">
	import type { MemoryDto, RoomDto } from '@kakao-agent/shared';
	import { toast } from 'svelte-sonner';
	import Icon from '$lib/components/icon.svelte';
	import Page from '$lib/components/page.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { del, errorMessage, post } from '$lib/api';
	import { dateTime } from '$lib/format';
	import { invalidate, useQuery } from '$lib/query.svelte';

	const memories = useQuery<MemoryDto[]>(() => '/memories', { interval: 30_000 });
	const rooms = useQuery<RoomDto[]>(() => '/rooms');
	const agentRooms = $derived((rooms.data ?? []).filter((room) => room.canSend && room.enabled));

	/** Room → person → that person's memories, rooms and people in a stable order. */
	const grouped = $derived.by(() => {
		const byRoom = new Map<string, { room: string; people: Map<string, { person: string; items: MemoryDto[] }> }>();
		for (const memory of memories.data ?? []) {
			const room = byRoom.get(memory.room) ?? { room: memory.room, people: new Map() };
			const person = room.people.get(memory.userId) ?? { person: memory.person, items: [] };
			person.items.push(memory);
			room.people.set(memory.userId, person);
			byRoom.set(memory.room, room);
		}
		return [...byRoom.values()].map((room) => ({ room: room.room, people: [...room.people.values()] }));
	});

	async function remove(memory: MemoryDto) {
		try {
			await del(`/memories/${memory.id}`);
			await invalidate('/memories');
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	let refreshing = $state<string | null>(null);
	async function refresh(room: RoomDto) {
		refreshing = room.id;
		try {
			await post(`/rooms/${room.id}/notes`, { days: 7 });
			toast.success(`'${room.name}' 방 메모를 정리하고 있어요. 끝나면 여기에 나타나요`);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			refreshing = null;
		}
	}

	const CARD = 'rounded-[1.625rem] bg-card';
	const HEADER = 'px-4 text-xs font-semibold text-muted-foreground';
</script>

<!-- What the bot remembers, per room and person: facts people asked it to keep, and the nightly notes. -->
<Page title="기억" back={{ href: '/settings', label: '설정' }} class="max-w-2xl">
	{#if agentRooms.length}
		<section class="flex flex-col gap-2">
			<h2 class={HEADER}>대화에서 메모 정리 (매일 새벽 4시에 자동)</h2>
			<div class="{CARD} flex flex-col overflow-hidden">
				{#each agentRooms as room (room.id)}
					<div class="flex min-h-13 items-center gap-3 border-b px-4 last:border-b-0">
						<span class="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>
						<Button size="sm" variant="outline" disabled={refreshing === room.id} onclick={() => refresh(room)}>
							<Icon name="arrow_2_circlepath" data-icon="inline-start" />지금 정리
						</Button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if !memories.data}
		<Skeleton class="h-40 rounded-[1.625rem]" />
	{:else if grouped.length}
		{#each grouped as group (group.room)}
			<section class="flex flex-col gap-2">
				<h2 class={HEADER}>{group.room}</h2>
				<div class="flex flex-col gap-3">
					{#each group.people as person (person.person)}
						<div class="{CARD} flex flex-col gap-2 px-4 py-3">
							<p class="text-sm font-semibold">{person.person}</p>
							{#each person.items as memory (memory.id)}
								<div class="flex items-start gap-2">
									<div class="min-w-0 flex-1">
										<p class="text-sm break-words whitespace-pre-line">{memory.text}</p>
										<p class="text-xs text-muted-foreground">
											{memory.kind === 'told' ? '본인이 기억해 달라고 함' : '대화에서 정리한 메모'} · {dateTime(memory.updatedAt)}
										</p>
									</div>
									<Button size="icon-sm" variant="ghost" aria-label="지우기" onclick={() => remove(memory)}>
										<Icon name="trash" />
									</Button>
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{:else}
		<p class="px-4 text-sm text-muted-foreground">아직 기억한 게 없어요. 카카오톡에서 "/bot 나 다음 주에 시험이야, 기억해 줘"처럼 말해 보세요.</p>
	{/if}
</Page>
