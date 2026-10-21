import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// The logo is full-bleed with its artwork already inside the maskable safe zone,
// so no padding: iOS and Android apply their own corner shape.
export default defineConfig({
	headLinkOptions: { preset: '2023' },
	preset: {
		...preset,
		transparent: { ...preset.transparent, padding: 0 },
		maskable: { ...preset.maskable, padding: 0 },
		apple: { ...preset.apple, padding: 0 }
	},
	images: ['static/logo.svg']
});
