import { LayoutGrid, Library, Sparkles, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * §7.4 sidebar order; the mobile tab bar uses the same list.
 *
 * Settings is deliberately absent: the account menu already carries Profile and
 * Preferences, which are the same page, and a nav item for it made the sidebar
 * carry a destination you reach more naturally from your own avatar.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/library", label: "Library", icon: Library },
  { href: "/create", label: "Create", icon: Sparkles },
];
