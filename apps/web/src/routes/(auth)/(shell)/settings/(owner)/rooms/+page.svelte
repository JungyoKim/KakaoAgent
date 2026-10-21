<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from 'svelte-sonner';
	import type { DiscoveredRoom, RoomDto } from '@kakao-agent/shared';
	import NodeIcon from '$lib/components/node-icon.svelte';
	import Page from '$lib/components/page.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Item from '$lib/components/ui/item';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import * as Tabs from '$lib/components/ui/tabs';
	import { del, errorMessage, patch, post } from '$lib/api';
	import { timeAgo } from '$lib/format';
	import { ROOM_KIND_ICON, ROOM_KIND_LABEL } from '$lib/labels';
	import { invalidate, useQuery } from '$lib/query.svelte';
	import { trackScrollbar } from '$lib/scrollbar';

	const rooms = useQuery<RoomDto[]>(() => '/rooms');
	let adding = $state(false);
	const discovered = useQuery<DiscoveredRoom[]>(() => (adding ? '/rooms/discover' : null), { maxAge: 30_000 });
	let query = $state('');
	let manual = $state({ chatId: '', name: '' });
	let busy = $state<string | null>(null);

	const filtered = $derived(
		(discovered.data ?? []).filter(
			(room) => room.name.toLowerCase().includes(query.trim().toLowerCase()) || room.chatId.includes(query.trim())
		)
	);

	async function add(input: { chatId: string; name: string; kind?: string }) {
		busy = input.chatId;
		try {
			await post<RoomDto>('/rooms', { kind: 'other', ...input });
			toast.success(`'${input.name}' 방을 등록했어요`);
			await invalidate('/rooms');
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			busy = null;
		}
	}

	type EditMode = { room: RoomDto; field: 'name' | 'chatId' | 'delete' } | null;
	let editing = $state<EditMode>(null);
	let value = $state('');
	const isChatId = $derived(editing?.field === 'chatId');

	function edit(room: RoomDto, field: 'name' | 'chatId' | 'delete') {
		value = field === 'chatId' ? (room.chatId ?? '') : room.name;
		editing = { room, field };
	}

	async function run(action: () => Promise<unknown>, message: string) {
		try {
			await action();
			toast.success(message);
			await invalidate('/rooms');
			editing = null;
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	async function toggle(room: RoomDto, enabled: boolean) {
		try {
			await patch(`/rooms/${room.id}`, { enabled });
			await invalidate('/rooms');
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	async function setMemberVisible(room: RoomDto, memberVisible: boolean) {
		try {
			await patch(`/rooms/${room.id}`, { memberVisible });
			await invalidate('/rooms', '/users');
			toast.success(`'${room.name}' 방을 멤버에게 ${memberVisible ? '공개했어요' : '숨겼어요'}`);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}
</script>

<Page title="방 관리" back={{ href: '/settings', label: '설정' }}>
	{#snippet actions()}
		<Button onclick={() => (adding = true)}>
			<Icon name="plus" data-icon="inline-start" />방 등록
		</Button>
	{/snippet}

	{#if !rooms.data}
		<Skeleton class="h-20 rounded-3xl" />
	{:else if rooms.data.length}
		<Item.Group class="gap-2">
			{#each rooms.data as room (room.id)}
				<Item.Root variant="outline">
					<Item.Media>
						<NodeIcon icon={ROOM_KIND_ICON[room.kind ?? 'other'] ?? ROOM_KIND_ICON.other} color={room.enabled ? 'yellow' : 'gray'} size="lg" />
					</Item.Media>
					<Item.Content class="min-w-0">
						<Item.Title class="flex items-center gap-2">
							<span class="truncate">{room.name}</span>
							{#if room.canSend}
								<Badge class="shrink-0">보내기 허용</Badge>
							{/if}
							{#if room.memberVisible === false}
								<Badge variant="secondary" class="shrink-0">멤버에게 숨김</Badge>
							{/if}
						</Item.Title>
						<Item.Description class="truncate">
							{ROOM_KIND_LABEL[room.kind ?? 'other']} · ID <span class="font-mono">{room.chatId}</span>
						</Item.Description>
					</Item.Content>
					<Item.Actions>
						<Switch aria-label="사용" checked={room.enabled} onCheckedChange={(on) => toggle(room, on)} />
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} size="icon-sm" variant="ghost" aria-label="더 보기">
										<Icon name="ellipsis" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-48">
								<DropdownMenu.Item onSelect={() => edit(room, 'name')}>이름 바꾸기</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => edit(room, 'chatId')}>채팅방 ID 바꾸기</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => setMemberVisible(room, room.memberVisible === false)}>
									{room.memberVisible === false ? '멤버에게 공개' : '멤버에게 숨기기'}
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item variant="destructive" onSelect={() => edit(room, 'delete')}>삭제</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</Item.Actions>
				</Item.Root>
			{/each}
		</Item.Group>
	{:else}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon">
					<Icon name="bubble_left" />
				</Empty.Media>
				<Empty.Title>등록된 방이 없어요</Empty.Title>
			</Empty.Header>
		</Empty.Root>
	{/if}

	<Dialog.Root bind:open={adding}>
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>방 등록</Dialog.Title>
			</Dialog.Header>
			<Tabs.Root value="discover">
				<Tabs.List class="w-full">
					<Tabs.Trigger value="discover">대화 목록에서 찾기</Tabs.Trigger>
					<Tabs.Trigger value="manual">ID 직접 입력</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="discover" class="flex flex-col gap-3 pt-2">
					<InputGroup.Root>
						<InputGroup.Input placeholder="방 이름이나 ID로 찾기" bind:value={query} />
						<InputGroup.Addon>
							<Icon name="search" />
						</InputGroup.Addon>
					</InputGroup.Root>
					<!-- Scrolls out to the dialog's edges, so its scrollbar sits on the edge; its width comes out of the right padding. -->
					<div {@attach trackScrollbar} class="-mx-6 max-h-[50vh] overflow-y-auto pr-edge-6 pl-6">
						{#if discovered.error && !discovered.data}
							<p class="py-6 text-center text-sm text-destructive">{discovered.error}</p>
						{:else if !discovered.data}
							<div class="flex justify-center py-8"><Spinner /></div>
						{:else}
							<Item.Group class="gap-1">
								{#each filtered as room (room.chatId)}
									<Item.Root size="sm" class="hover:bg-muted/50">
										<Item.Content class="min-w-0">
											<Item.Title class="truncate">{room.name}</Item.Title>
											<Item.Description>
												{ROOM_KIND_LABEL[room.kind]} · {room.members}명 · {timeAgo(room.lastActiveAt)}
											</Item.Description>
											{#if room.preview}
												<Item.Description class="line-clamp-1">"{room.preview}"</Item.Description>
											{/if}
										</Item.Content>
										<Item.Actions>
											{#if room.registeredId}
												<Badge variant="secondary">등록됨</Badge>
											{:else}
												<Button
													size="sm"
													variant="outline"
													disabled={busy === room.chatId}
													onclick={() => add({ chatId: room.chatId, name: room.name, kind: room.kind })}
												>
													등록
												</Button>
											{/if}
										</Item.Actions>
									</Item.Root>
								{/each}
							</Item.Group>
						{/if}
					</div>
				</Tabs.Content>
				<Tabs.Content value="manual" class="pt-2">
					<Field.Group>
						<Field.Field>
							<Field.Label for="chatId">채팅방 ID</Field.Label>
							<Input
								id="chatId"
								inputmode="numeric"
								value={manual.chatId}
								oninput={(event) => (manual.chatId = event.currentTarget.value.replace(/\D/g, ''))}
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="roomName">표시할 이름</Field.Label>
							<Input id="roomName" bind:value={manual.name} maxlength={60} />
						</Field.Field>
						<Button
							class="self-start"
							disabled={!manual.chatId || !manual.name.trim() || busy !== null}
							onclick={async () => {
								await add(manual);
								manual = { chatId: '', name: '' };
							}}
						>
							등록
						</Button>
					</Field.Group>
				</Tabs.Content>
			</Tabs.Root>
		</Dialog.Content>
	</Dialog.Root>

	<AlertDialog.Root open={editing?.field === 'delete'} onOpenChange={(open) => !open && (editing = null)}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>'{editing?.room.name}' 방을 삭제할까요?</AlertDialog.Title>
				<AlertDialog.Description>봇이 이 방의 메시지를 더 이상 받지 않아요. 카카오톡 방 자체는 그대로예요.</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>취소</AlertDialog.Cancel>
				<AlertDialog.Action
					variant="destructive"
					onclick={() => editing && run(() => del(`/rooms/${editing!.room.id}`), '방을 삭제했어요')}
				>
					삭제
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>

	<Dialog.Root open={editing?.field === 'name' || editing?.field === 'chatId'} onOpenChange={(open) => !open && (editing = null)}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{isChatId ? '채팅방 ID 바꾸기' : '방 이름 바꾸기'}</Dialog.Title>
			</Dialog.Header>
			<Input
				aria-label={isChatId ? '채팅방 ID' : '방 이름'}
				{value}
				inputmode={isChatId ? 'numeric' : undefined}
				maxlength={isChatId ? 20 : 60}
				oninput={(event) => (value = isChatId ? event.currentTarget.value.replace(/\D/g, '') : event.currentTarget.value)}
			/>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (editing = null)}>취소</Button>
				<Button
					disabled={!value.trim()}
					onclick={() =>
						editing &&
						run(() => patch(`/rooms/${editing!.room.id}`, isChatId ? { chatId: value } : { name: value.trim() }), '저장했어요')}
				>
					저장
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
</Page>
