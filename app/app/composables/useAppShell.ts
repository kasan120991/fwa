// Shared state for the admin app shell.

/** Whether the sidebar is collapsed to the icon rail (desktop only). */
export function useSidebarCollapsed() {
  return useState<boolean>('app:sidebar-collapsed', () => false)
}

/** Whether the sidebar drawer is open on mobile (below lg). */
export function useSidebarMobileOpen() {
  return useState<boolean>('app:sidebar-mobile-open', () => false)
}
