<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { useRegisterSW } from 'virtual:pwa-register/svelte';

	const UPDATE_CHECK_MS = 60 * 60 * 1000;

	/*
	 * Service worker lifecycle for the installed app: checks for a new version every hour (a home
	 * screen app can stay open for days), offers it as a toast instead of reloading on its own,
	 * and says so while the device is offline.
	 */
	const { needRefresh, updateServiceWorker } = useRegisterSW({
		onRegisteredSW(url, registration) {
			if (!registration) return;
			setInterval(async () => {
				if (registration.installing || !navigator.onLine) return;
				const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } }).catch(() => null);
				if (response?.status === 200) await registration.update();
			}, UPDATE_CHECK_MS);
		}
	});

	let online = $state(navigator.onLine);

	onMount(() => {
		const update = () => (online = navigator.onLine);
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});

	$effect(() => {
		if (!$needRefresh) return;
		const id = toast('새 버전이 있어요', {
			duration: Number.POSITIVE_INFINITY,
			action: { label: '새로고침', onClick: () => void updateServiceWorker(true) }
		});
		return () => toast.dismiss(id);
	});

	$effect(() => {
		if (online) return;
		const id = toast.warning('인터넷에 연결되어 있지 않아요', { duration: Number.POSITIVE_INFINITY });
		return () => toast.dismiss(id);
	});
</script>
