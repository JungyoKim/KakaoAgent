import type { Attachment } from 'svelte/attachments';

/**
 * Keeps --scrollbar on a scroll area set to the width its scrollbar takes up: 0 while it has none, or
 * where scrollbars float over the content. A scroll area that reaches out over its container's side
 * padding and pads itself back in takes that much off its right padding with pr-edge-* (layout.css),
 * so its content lines up with what sits above it, scrollbar or not.
 */
export const trackScrollbar: Attachment<HTMLElement> = (node) => {
	const observer = new ResizeObserver(() => {
		node.style.setProperty('--scrollbar', `${node.offsetWidth - node.clientWidth}px`);
	});
	observer.observe(node);
	return () => observer.disconnect();
};
