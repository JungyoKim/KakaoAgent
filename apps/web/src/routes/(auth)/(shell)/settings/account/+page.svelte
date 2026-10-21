<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import type { Me } from '@kakao-agent/shared';
	import KakaoButton from '$lib/components/kakao-button.svelte';
	import Page from '$lib/components/page.svelte';
	import UserAvatar from '$lib/components/user-avatar.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import { errorMessage, patch } from '$lib/api';
	import { kakaoError } from '$lib/kakao';
	import { currentUser, ME_PATH } from '$lib/me.svelte';
	import { setQueryData } from '$lib/query.svelte';

	const me = $derived(currentUser());
	const owner = $derived(me.role === 'owner');
	let displayName = $state(currentUser().displayName);
	const error = kakaoError(page.url.searchParams.get('error'));

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		try {
			setQueryData<Me>(ME_PATH, await patch<Me>('/account', { displayName }));
			toast.success('이름을 바꿨어요');
		} catch (err) {
			toast.error(errorMessage(err));
		}
	}
</script>

<Page title="내 계정" back={{ href: '/settings', label: '설정' }} class="max-w-2xl">
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				{me.displayName}
				<Badge variant="secondary">{owner ? '방장' : '멤버'}</Badge>
			</Card.Title>
		</Card.Header>
		{#if owner}
			<Card.Content>
				<form onsubmit={saveName} class="flex items-end gap-2">
					<Field.Field class="flex-1">
						<Field.Label for="name">이름</Field.Label>
						<Input id="name" bind:value={displayName} maxlength={20} />
					</Field.Field>
					<Button type="submit" disabled={!displayName.trim() || displayName === me.displayName}>저장</Button>
				</form>
			</Card.Content>
		{/if}
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>카카오 계정</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3">
			{#if me.kakao}
				<Item.Root variant="outline">
					<Item.Media>
						<UserAvatar name={me.kakao.nickname} image={me.kakao.image} />
					</Item.Media>
					<Item.Content>
						<Item.Title>{me.kakao.nickname}</Item.Title>
						<Item.Description>연결됨</Item.Description>
					</Item.Content>
				</Item.Root>
			{:else}
				<KakaoButton href="/api/auth/kakao/start?mode=link" class="sm:w-auto sm:self-start">카카오 계정 연결</KakaoButton>
			{/if}
			{#if error}
				<Field.Error>{error}</Field.Error>
			{/if}
		</Card.Content>
	</Card.Root>
</Page>
