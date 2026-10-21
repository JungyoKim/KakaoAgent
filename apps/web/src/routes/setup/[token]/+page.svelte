<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AuthFrame from '$lib/components/auth-frame.svelte';
	import FullPageSpinner from '$lib/components/full-page-spinner.svelte';
	import KakaoButton from '$lib/components/kakao-button.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { api, errorMessage } from '$lib/api';
	import { kakaoError } from '$lib/kakao';

	const token = page.params.token ?? '';
	let link = $state<{ ok: true; kakao: boolean; existing: boolean } | null>(null);
	let failure = $state<string | null>(null);

	api<{ ok: true; kakao: boolean; existing: boolean }>(`/setup/${token}`)
		.then((data) => (link = data))
		.catch((error) => (failure = errorMessage(error)));

	const error = $derived(link ? kakaoError(page.url.searchParams.get('error') ?? (link.kakao ? null : 'kakao-off')) : '');
</script>

{#if failure !== null}
	<AuthFrame title="설정 링크를 쓸 수 없어요" description={failure}>
		<Button class="w-full" variant="outline" onclick={() => goto('/login')}>로그인 화면으로</Button>
	</AuthFrame>
{:else if !link}
	<FullPageSpinner />
{:else}
	<AuthFrame title="봇 처음 설정">
		<Field.Group>
			<KakaoButton href="/api/auth/kakao/start?mode=setup&token={encodeURIComponent(token)}" disabled={!link.kakao}>
				{link.existing ? '카카오로 방장 계정 연결' : '카카오로 방장 계정 만들기'}
			</KakaoButton>
			{#if error}
				<Field.Error class="text-center">{error}</Field.Error>
			{/if}
		</Field.Group>
	</AuthFrame>
{/if}
