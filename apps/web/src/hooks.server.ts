import type { Handle } from '@sveltejs/kit';
import { splashLinks } from '../pwa/splash-sizes.ts';

// The app is a single-page app, so this only runs while the build renders index.html (and in the
// dev server): it adds the iOS splash screen links, which depend on the build's list of iPhone sizes.
export const handle: Handle = ({ event, resolve }) =>
	resolve(event, { transformPageChunk: ({ html }) => html.replace('%app.splash%', splashLinks) });
