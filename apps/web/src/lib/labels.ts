/** Room glyphs by kind, filled Framework7 icons on the room's colored square. */
export const ROOM_KIND_ICON: Record<string, string> = {
	group: 'person_3_fill',
	direct: 'person_fill',
	open: 'bubble_left_bubble_right_fill',
	memo: 'bookmark_fill',
	other: 'bubble_left_fill'
};

export const ROOM_KIND_LABEL: Record<string, string> = {
	group: '단체방',
	direct: '1:1',
	open: '오픈채팅',
	memo: '나와의 채팅',
	other: '기타'
};
