import { MediaQuery } from 'svelte/reactivity';

/** Below the md breakpoint: the tab bar and large titles instead of the sidebar. */
export const narrow = new MediaQuery('max-width: 767px');
