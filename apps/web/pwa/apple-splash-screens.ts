import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Plugin } from 'vite';

import { SPLASH_THEMES, splashFile, splashSizes } from './splash-sizes.ts';

interface SplashOptions {
	/** Square logo SVG, relative to the Vite root. */
	logo: string;
	/** Background colors; iOS picks one by the phone's appearance setting. */
	light: string;
	dark: string;
	/** Logo width as a share of the screen width. */
	logoScale?: number;
}

/**
 * iOS home-screen apps ignore the manifest's splash settings and show a blank screen at launch
 * unless they get an apple-touch-startup-image for the exact screen. This renders one per iPhone
 * screen size (portrait, light and dark) into the client build; src/hooks.server.ts links them
 * in the page head.
 */
export function appleSplashScreens({ logo, light, dark, logoScale = 0.28 }: SplashOptions): Plugin {
	const colors: Record<(typeof SPLASH_THEMES)[number], string> = { light, dark };
	let root = process.cwd();

	return {
		name: 'kakao-agent:apple-splash-screens',
		apply: 'build',
		configResolved(config) {
			root = config.root;
		},
		async generateBundle() {
			if (this.environment.name !== 'client') return;
			// iOS rounds app icons itself, but a splash shows the image as is: round the corners here.
			const svg = (await readFile(`${root}/${logo}`, 'utf8'))
				.replace(/<svg([^>]*)>/, '<svg$1><clipPath id="splash-round"><rect width="512" height="512" rx="115"/></clipPath><g clip-path="url(#splash-round)">')
				.replace(/<\/svg>\s*$/, '</g></svg>');
			for (const size of splashSizes) {
				const logoSize = Math.round(size.width * logoScale);
				const image = await sharp(Buffer.from(svg), { density: 300 }).resize(logoSize, logoSize).png().toBuffer();
				for (const theme of SPLASH_THEMES) {
					const source = await sharp({ create: { width: size.width, height: size.height, channels: 3, background: colors[theme] } })
						.composite([{ input: image, gravity: 'center' }])
						.png({ compressionLevel: 9, palette: true })
						.toBuffer();
					this.emitFile({ type: 'asset', fileName: splashFile(theme, size), source });
				}
			}
		}
	};
}
