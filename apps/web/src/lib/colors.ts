/*
 * Colors from the Shortcuts app. Automation tiles use its soft palette as a gradient from a lighter
 * top-left to the base color; action icons use the iOS system colors with white glyphs.
 *
 * Tile colors are CSS variables set by tileStyle(), so the classes below stay static and a tile's
 * switch thumb can reuse the same gradient.
 */
const PALETTE: Record<string, [from: string, to: string]> = {
	red: ['#f0818a', '#e4606a'],
	orange: ['#f6b57c', '#ee964f'],
	yellow: ['#f7d264', '#eebb2c'],
	green: ['#80d882', '#5cbf5f'],
	teal: ['#70e3c6', '#4fc7a5'],
	sky: ['#6ec8f6', '#48abec'],
	blue: ['#5d9ff8', '#3b80f0'],
	indigo: ['#6f7dd2', '#4a58b3'],
	purple: ['#9c72d6', '#7b50bf'],
	pink: ['#f1a9dd', '#e285c9'],
	brown: ['#bea888', '#a38b6c'],
	gray: ['#a5aeb9', '#86909c']
};

const SYSTEM: Record<string, string> = {
	yellow: '#ffcc00',
	orange: '#ff9500',
	red: '#ff3b30',
	green: '#34c759',
	teal: '#00c7be',
	sky: '#32ade6',
	blue: '#007aff',
	indigo: '#5856d6',
	purple: '#af52de',
	pink: '#ff2d55',
	brown: '#a2845e',
	gray: '#8e8e93'
};

/** Sets a tile's colors; pair it with TILE_BG (and TILE_THUMB for its switch). */
export const tileStyle = (color: string) => {
	const [from, to] = PALETTE[color] ?? PALETTE.gray!;
	return `--tile-from: ${from}; --tile-to: ${to};`;
};

export const TILE_BG = 'bg-linear-to-br from-(--tile-from) to-(--tile-to) text-white';

/** The tile's gradient on the thumb of its on/off switch while the switch is on. */
export const TILE_THUMB = 'data-checked:bg-linear-to-br data-checked:from-(--tile-from) data-checked:to-(--tile-to)';

/** Solid background for an action icon (catalog color), with a white glyph. */
export const nodeStyle = (color: string) => `background-color: ${SYSTEM[color] ?? SYSTEM.gray}; color: #fff;`;
