export type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
/** Browser UI and status bar color per theme; matches --background in layout.css and app.html. */
const THEME_COLOR: Record<Resolved, string> = { light: '#f2f2f7', dark: '#000000' };

function isTheme(value: string | null): value is Theme {
	return value === 'light' || value === 'dark' || value === 'system';
}

function saved(): Theme {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return isTheme(value) ? value : 'system';
	} catch {
		return 'system';
	}
}

export const theme: { value: Theme } = $state({ value: saved() });

const resolve = (value: Theme): Resolved =>
	value === 'system' ? (matchMedia(DARK_QUERY).matches ? 'dark' : 'light') : value;

/** Theme changes switch instantly, without every transition in the page running at once. */
function withoutTransitions(change: () => void) {
	const style = document.createElement('style');
	style.textContent = '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}';
	document.head.appendChild(style);
	change();
	getComputedStyle(document.body);
	requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
}

function apply(value: Theme) {
	const resolved = resolve(value);
	withoutTransitions(() => {
		const root = document.documentElement;
		root.classList.remove('light', 'dark');
		root.classList.add(resolved);
		document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta, index) => {
			if (index > 0) return meta.remove();
			meta.removeAttribute('media');
			meta.content = THEME_COLOR[resolved];
		});
	});
}

export function setTheme(value: Theme): void {
	theme.value = value;
	localStorage.setItem(STORAGE_KEY, value);
	apply(value);
}

/** Follows the OS setting while the theme is "system", and theme changes made in other tabs. */
export function watchTheme(): () => void {
	const query = matchMedia(DARK_QUERY);
	const onSystem = () => theme.value === 'system' && apply('system');
	const onStorage = (event: StorageEvent) => {
		if (event.storageArea !== localStorage || event.key !== STORAGE_KEY) return;
		theme.value = isTheme(event.newValue) ? event.newValue : 'system';
		apply(theme.value);
	};
	query.addEventListener('change', onSystem);
	window.addEventListener('storage', onStorage);
	return () => {
		query.removeEventListener('change', onSystem);
		window.removeEventListener('storage', onStorage);
	};
}

