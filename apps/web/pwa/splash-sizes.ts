import { appleSplashScreenSizes, type AppleDeviceSize } from '@vite-pwa/assets-generator/config';

export interface SplashSize {
	width: number;
	height: number;
	scale: number;
}

export const SPLASH_THEMES = ['light', 'dark'] as const;

/** One portrait splash image per distinct iPhone screen size. */
export const splashSizes: SplashSize[] = (() => {
	const sizes = new Map<string, SplashSize>();
	for (const [device, size] of Object.entries(appleSplashScreenSizes) as [string, AppleDeviceSize][]) {
		if (!device.startsWith('iPhone')) continue;
		sizes.set(`${size.width}x${size.height}`, { width: size.width, height: size.height, scale: size.scaleFactor });
	}
	return [...sizes.values()];
})();

export const splashFile = (theme: string, size: SplashSize) => `splash/apple-splash-${theme}-${size.width}x${size.height}.png`;

/** The apple-touch-startup-image links for every size and theme, for the page head. */
export const splashLinks = splashSizes
	.flatMap((size) =>
		SPLASH_THEMES.map((theme) => {
			const media = [
				'screen',
				`(device-width: ${size.width / size.scale}px)`,
				`(device-height: ${size.height / size.scale}px)`,
				`(-webkit-device-pixel-ratio: ${size.scale})`,
				'(orientation: portrait)',
				`(prefers-color-scheme: ${theme})`
			].join(' and ');
			return `<link rel="apple-touch-startup-image" media="${media}" href="/${splashFile(theme, size)}" />`;
		})
	)
	.join('\n\t\t');
