// Single source of truth for the main tab order — used by the nav bar and the
// mobile swipe-to-navigate gesture so they always stay in step.

export const TABS = [
  { href: '/', label: 'Standings' },
  { href: '/golfers', label: 'The Field' },
  { href: '/feed', label: 'Live Feed' },
  { href: '/draft', label: 'Draft Room' },
];

export const ADMIN_TAB = { href: '/admin', label: 'Admin' };

// The tabs a given user actually sees (admins get the Admin tab appended). The
// swipe gesture cycles through exactly this list, so a non-admin never swipes
// onto /admin.
export function navTabs(isAdmin) {
  return isAdmin ? [...TABS, ADMIN_TAB] : TABS;
}

// Index of a pathname within the tab order, or -1 if it isn't a tab page.
// '/' must match exactly (every path startsWith '/').
export function tabIndex(pathname, isAdmin = true) {
  const tabs = navTabs(isAdmin);
  if (pathname === '/') return 0;
  return tabs.findIndex((t) => t.href !== '/' && pathname.startsWith(t.href));
}
