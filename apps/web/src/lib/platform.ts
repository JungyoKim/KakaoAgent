/** In development, ?ios (or ?mobile-os for Android) in the address makes a desktop browser act the part. */
const devFlag = (name: string) =>
	import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has(name);

/**
 * iPhone and iPad. Their own select (a menu right at the tapped chip) is the nicest way to pick an
 * option there, so choices use it; elsewhere the app's own menu does better.
 */
export const isIOS: boolean = (() => {
	if (typeof navigator === 'undefined') return false;
	if (devFlag('ios')) return true;
	const ua = navigator.userAgent;
	if (/iPhone|iPad|iPod/i.test(ua)) return true;
	// iPadOS asks for desktop sites and says it is a Mac; a Mac has no touch screen.
	return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
})();

/**
 * Phones and tablets, by operating system rather than screen size: iOS, iPadOS and Android. There
 * editing opens a sheet from the bottom instead of a popover, which a keyboard would cover.
 */
export const isMobileOS: boolean = (() => {
	if (typeof navigator === 'undefined') return false;
	if (isIOS || devFlag('mobile-os')) return true;
	const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } }).userAgentData;
	return !!uaData?.mobile || uaData?.platform === 'Android' || /Android/i.test(navigator.userAgent);
})();
