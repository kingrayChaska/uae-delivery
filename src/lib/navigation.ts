// Remembers whether the desktop sidebar is collapsed. A cookie rather than
// localStorage, so the server can render the right width on first paint.
export const SIDEBAR_COOKIE = 'pl_sidebar';

export const isSidebarCollapsed = (value: string | undefined) => value === 'collapsed';
