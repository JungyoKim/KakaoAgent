
/** Main pages: the sidebar on wide screens, the tab bar on phones. */
export const MAIN_NAV = [
	{ href: '/', label: '홈', icon: 'house' },
	{ href: '/stats', label: '통계', icon: 'chart_bar' }
];

/**
 * Owner settings: the sidebar on wide screens (outline icon), the settings tab on phones (the filled
 * icon on a square of `color`, like the iOS Settings list).
 */
export const OWNER_NAV = [
	{ href: '/settings/rooms', label: '방 관리', icon: 'bubble_left', color: 'yellow' },
	{ href: '/settings/members', label: '멤버', icon: 'person_2', color: 'blue' },
	{ href: '/settings/names', label: '이름 표시', icon: 'person', color: 'green' },
	{ href: '/settings/memory', label: '기억', icon: 'lightbulb', color: 'orange' },
	{ href: '/settings/system', label: '시스템', icon: 'gear_alt', color: 'gray' }
];

export const TABS = [...MAIN_NAV, { href: '/settings', label: '설정', icon: 'gear_alt' }];

/** Whether a nav link is the current page (the home link only for the list itself). */
export const isActive = (pathname: string, href: string) =>
	href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
