<script lang="ts">
	import Icon from '$lib/components/icon.svelte';
	import { toast } from 'svelte-sonner';
	import type { RoomDto, UserDto } from '@kakao-agent/shared';
	import Page from '$lib/components/page.svelte';
	import RoomChecklist from '$lib/components/room-checklist.svelte';
	import UserAvatar from '$lib/components/user-avatar.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import { Switch } from '$lib/components/ui/switch';
	import { del, errorMessage, patch } from '$lib/api';
	import { timeAgo } from '$lib/format';
	import { invalidate, useQuery } from '$lib/query.svelte';

	const users = useQuery<UserDto[]>(() => '/users');
	const rooms = useQuery<RoomDto[]>(() => '/rooms');
	let action = $state<{ user: UserDto; kind: 'rename' | 'delete' } | null>(null);
	let name = $state('');
	/** The rooms dialog: every room not hidden from members, or the ones chosen. */
	let access = $state<{ user: UserDto; all: boolean; ids: string[] } | null>(null);

	const roomNames = (ids: string[]) =>
		ids.map((id) => rooms.data?.find((room) => room.id === id)?.name).filter(Boolean).join(', ');

	function start(user: UserDto, kind: 'rename' | 'delete') {
		name = user.displayName;
		action = { user, kind };
	}

	async function run(work: () => Promise<unknown>, done: string) {
		try {
			await work();
			await invalidate('/users');
			toast.success(done);
			action = null;
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	async function setDisabled(user: UserDto, disabled: boolean) {
		try {
			await patch(`/users/${user.id}`, { disabled });
			await invalidate('/users');
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}

	/** Starts from what the member has now; turning "공개된 방 모두" off starts from those rooms. */
	function editRooms(user: UserDto) {
		const open = (rooms.data ?? []).filter((room) => room.memberVisible !== false).map((room) => room.id);
		access = { user, all: user.roomIds === null, ids: user.roomIds ?? open };
	}

	async function saveRooms() {
		if (!access) return;
		const { user, all, ids } = access;
		try {
			await patch(`/users/${user.id}`, { roomIds: all ? null : ids });
			await invalidate('/users');
			toast.success(`${user.displayName}님이 볼 수 있는 방을 바꿨어요`);
			access = null;
		} catch (error) {
			toast.error(errorMessage(error));
		}
	}
</script>

<Page title="멤버" back={{ href: '/settings', label: '설정' }}>
	<Item.Group class="gap-2">
		{#each users.data ?? [] as user (user.id)}
			<Item.Root variant="outline">
				<Item.Media>
					<UserAvatar name={user.displayName} image={user.kakao?.image} />
				</Item.Media>
				<Item.Content class="min-w-0">
					<Item.Title class="flex items-center gap-2">
						{user.displayName}
						{#if user.role === 'owner'}<Badge>방장</Badge>{/if}
						{#if user.disabled}<Badge variant="destructive">꺼짐</Badge>{/if}
					</Item.Title>
					<Item.Description class="truncate">
						{user.kakao ? `카카오 ${user.kakao.nickname}` : '카카오 계정 연결 안 됨'} · {timeAgo(user.createdAt)} 가입
					</Item.Description>
					{#if user.roomIds}
						<Item.Description class="truncate">
							{user.roomIds.length ? `볼 수 있는 방: ${roomNames(user.roomIds)}` : '볼 수 있는 방 없음'}
						</Item.Description>
					{/if}
				</Item.Content>
				{#if user.role === 'member'}
					<Item.Actions>
						<Switch aria-label="사용" checked={!user.disabled} onCheckedChange={(on) => setDisabled(user, !on)} />
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} size="icon-sm" variant="ghost" aria-label="더 보기">
										<Icon name="ellipsis" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-48">
								<DropdownMenu.Item onSelect={() => start(user, 'rename')}>이름 바꾸기</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => editRooms(user)}>볼 수 있는 방</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item variant="destructive" onSelect={() => start(user, 'delete')}>삭제</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</Item.Actions>
				{/if}
			</Item.Root>
		{/each}
	</Item.Group>

	<Dialog.Root open={action?.kind === 'rename'} onOpenChange={(open) => !open && (action = null)}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>이름 바꾸기</Dialog.Title>
			</Dialog.Header>
			<Field.Field>
				<Field.Label for="member-name">이름</Field.Label>
				<Input id="member-name" bind:value={name} maxlength={20} />
			</Field.Field>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (action = null)}>취소</Button>
				<Button
					disabled={!name.trim()}
					onclick={() => action && run(() => patch(`/users/${action!.user.id}`, { displayName: name.trim() }), '이름을 바꿨어요')}
				>
					저장
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<Dialog.Root open={!!access} onOpenChange={(open) => !open && (access = null)}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{access?.user.displayName}님이 볼 수 있는 방</Dialog.Title>
			</Dialog.Header>
			{#if access}
				<Field.Field orientation="horizontal">
					<Field.Label for="rooms-all" class="flex-1">공개된 방 모두</Field.Label>
					<Switch id="rooms-all" bind:checked={access.all} />
				</Field.Field>
				{#if !access.all}
					<RoomChecklist rooms={rooms.data ?? []} value={access.ids} onchange={(ids) => access && (access.ids = ids)} />
				{/if}
			{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (access = null)}>취소</Button>
				<Button onclick={saveRooms}>저장</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<AlertDialog.Root open={action?.kind === 'delete'} onOpenChange={(open) => !open && (action = null)}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>{action?.user.displayName}님을 삭제할까요?</AlertDialog.Title>
				<AlertDialog.Description>
					다시 로그인하면 새 계정이 생기니, 막으려면 사용을 끄세요.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>취소</AlertDialog.Cancel>
				<AlertDialog.Action
					variant="destructive"
					onclick={() => action && run(() => del(`/users/${action!.user.id}`), '삭제했어요')}
				>
					삭제
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</Page>
