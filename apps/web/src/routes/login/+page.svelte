<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { AuthOptions } from '@kakao-agent/shared';
	import AuthFrame from '$lib/components/auth-frame.svelte';
	import FullPageSpinner from '$lib/components/full-page-spinner.svelte';
	import KakaoButton from '$lib/components/kakao-button.svelte';
	import * as Field from '$lib/components/ui/field';
	import { kakaoError } from '$lib/kakao';
	import { useMe } from '$lib/me.svelte';
	import { useQuery } from '$lib/query.svelte';

	const auth = useMe();
	const options = useQuery<AuthOptions>(() => (auth.me === null ? '/auth/options' : null));
	const nextParam = page.url.searchParams.get('next');
	const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

	$effect(() => {
		if (auth.me) void goto(next, { replaceState: true });
	});

	const kakaoReady = $derived(options.data?.kakao ?? false);
	const error = $derived(kakaoError(page.url.searchParams.get('error') ?? (options.data && !kakaoReady ? 'kakao-off' : null)));
</script>

{#if auth.me === undefined || auth.me || (auth.me === null && !options.data && !options.error)}
	<FullPageSpinner />
{:else if options.data?.setupNeeded}
	<AuthFrame title="봇" description="서버 로그의 설정 링크(/setup/…)를 열어 주세요" />
{:else}
	<AuthFrame title="봇">
		<Field.Group>
			<KakaoButton href="/api/auth/kakao/start?next={encodeURIComponent(next)}" disabled={!kakaoReady}>카카오 로그인</KakaoButton>
			{#if error}
				<Field.Error class="text-center">{error}</Field.Error>
			{/if}
		</Field.Group>
	</AuthFrame>
{/if}
