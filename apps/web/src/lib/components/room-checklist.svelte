<script lang="ts">
	import type { RoomDto } from '@kakao-agent/shared';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { ROOM_KIND_LABEL } from '$lib/labels';

	let {
		rooms,
		value,
		onchange,
		empty = '등록된 방이 없어요.'
	}: {
		rooms: Pick<RoomDto, 'id' | 'name' | 'kind' | 'enabled'>[];
		value: string[];
		onchange: (value: string[]) => void;
		empty?: string;
	} = $props();

	const toggle = (id: string, on: boolean) => onchange(on ? [...new Set([...value, id])] : value.filter((v) => v !== id));
</script>

<!-- Checkbox list of rooms. Used for trigger rooms and access grants. -->
{#if !rooms.length}
	<p class="text-sm text-muted-foreground">{empty}</p>
{:else}
	<div class="flex flex-col gap-1">
		{#each rooms as room (room.id)}
			<Field.Field orientation="horizontal" class="rounded-2xl px-2 py-1.5 hover:bg-muted/60">
				<Checkbox id="room-{room.id}" checked={value.includes(room.id)} onCheckedChange={(on) => toggle(room.id, on)} />
				<Field.Label for="room-{room.id}" class="flex flex-1 items-center justify-between gap-2 font-normal">
					<span class="truncate">{room.name}</span>
					<span class="shrink-0 text-xs text-muted-foreground">
						{!room.enabled ? '꺼짐 · ' : ''}{ROOM_KIND_LABEL[room.kind ?? 'other']}
					</span>
				</Field.Label>
			</Field.Field>
		{/each}
	</div>
{/if}
