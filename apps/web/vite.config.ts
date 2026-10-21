import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig, type Plugin } from 'vite';

import { appleSplashScreens } from './pwa/apple-splash-screens.ts';

/** Matches --background in layout.css (light and dark). */
const BACKGROUND = { light: '#f2f2f7', dark: '#000000' };

// Keep the browser's Host so the server builds the Kakao redirect URI for the address in use.
const api = { '/api': { target: 'http://localhost:8787', changeOrigin: false } };

/**
 * The dev server has no service worker, but a browser or iPhone app that once opened a build on
 * the same address keeps that build's worker, which goes on serving the old app from its cache.
 * The dev server answers its update check with a worker that removes itself and reloads the page.
 */
function devRemovesServiceWorker(): Plugin {
	const worker = `self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister()
    for (const key of await caches.keys()) await caches.delete(key)
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url)
  })())
})`;
	return {
		name: 'kakao-agent:dev-removes-service-worker',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/sw.js', (_req, res) => {
				res.setHeader('Content-Type', 'text/javascript');
				res.setHeader('Cache-Control', 'no-store');
				res.end(worker);
			});
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// A single-page app built into dist/, which the server serves; every path falls back to
			// index.html and the client router takes over.
			adapter: adapter({ pages: 'dist', assets: 'dist', fallback: 'index.html' }),
			serviceWorker: { register: false }
		}),
		devRemovesServiceWorker(),
		SvelteKitPWA({
			// A new version waits until the user taps "새로고침" (see pwa-status.svelte), so an update
			// never reloads the page in the middle of editing an automation.
			registerType: 'prompt',
			injectRegister: false,
			includeManifestIcons: false,
			kit: { adapterFallback: 'index.html', spa: true },
			manifest: {
				id: '/',
				name: '봇',
				short_name: '봇',
				description: '카카오톡 봇을 관리하는 곳',
				lang: 'ko',
				dir: 'ltr',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: BACKGROUND.dark,
				// No theme color here: the manifest can hold only one, and a dark one clashed with the
				// light theme's header. The theme-color meta tags follow the app theme instead.
				theme_color: undefined,
				categories: ['productivity', 'utilities'],
				prefer_related_applications: false,
				icons: [
					{ src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{ src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				],
				shortcuts: []
			},
			workbox: {
				navigateFallback: '/index.html',
				navigateFallbackDenylist: [/^\/api\//, /^\/healthz/],
				globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
				// Splash screens are only fetched by iOS when adding to the home screen, and fonts for
				// scripts the UI rarely shows are cached on first use instead of up front.
				// Pretendard comes as ~90 subsets by Unicode range: the browser fetches only those a page
				// uses and the fonts rule below caches them, so none are precached up front.
				globIgnores: ['splash/**', '**/PretendardVariable.subset.*.woff2'],
				cleanupOutdatedCaches: true,
				clientsClaim: true,
				runtimeCaching: [
					{
						urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
						handler: 'CacheFirst',
						options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 } }
					},
					{
						// Kakao profile photos: a new photo gets a new URL, so cached ones never go stale.
						urlPattern: ({ url }) => url.hostname.endsWith('.kakaocdn.net'),
						handler: 'CacheFirst',
						options: {
							cacheName: 'kakao-profile-images',
							expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
							cacheableResponse: { statuses: [0, 200] }
						}
					}
				]
			}
		}),
		appleSplashScreens({ logo: 'static/logo.svg', ...BACKGROUND })
	],
	server: { proxy: api },
	preview: { proxy: api }
});

