const relative = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

export function timeAgo(at: number | null | undefined): string {
	if (!at) return '—';
	const seconds = Math.round((at - Date.now()) / 1000);
	const abs = Math.abs(seconds);
	if (abs < 45) return '방금';
	if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
	if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
	if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), 'day');
	return dateTime(at);
}

export function dateTime(at: number): string {
	return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at);
}

export function duration(from: number, to: number | null): string {
	if (!to) return '실행 중';
	const ms = to - from;
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}초`;
}
