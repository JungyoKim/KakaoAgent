const KAKAO_ERRORS: Record<string, string> = {
	cancelled: '카카오 로그인을 취소했어요.',
	expired: '시간이 지났거나 다른 창에서 시작한 로그인이에요. 다시 시도해 주세요.',
	kakao: '카카오에서 정보를 받지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
	disabled: '방장이 사용을 막아 둔 계정이에요.',
	'no-owner': '방장 설정이 아직 끝나지 않았어요. 서버 로그의 설정 링크를 먼저 열어 주세요.',
	'setup-used': '이미 쓴 설정 링크예요. 방장이라면 카카오로 로그인해 주세요.',
	'kakao-off': '카카오 로그인이 아직 설정되지 않았어요 (KAKAO_REST_API_KEY).',
	'kakao-taken': '그 카카오 계정은 이미 다른 봇 계정에 연결돼 있어요.',
	busy: '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.'
};

/** Explains the ?error= code the server adds when a Kakao round trip fails. */
export function kakaoError(code: string | null): string {
	if (!code) return '';
	return KAKAO_ERRORS[code] ?? '로그인하지 못했어요. 다시 시도해 주세요.';
}
