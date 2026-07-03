// Shared state for the admin app shell.

/** Whether the sidebar is collapsed to the icon rail. */
export function useSidebarCollapsed() {
  return useState<boolean>('app:sidebar-collapsed', () => false)
}
