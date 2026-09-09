import { LayoutGrid, Library, Settings, Sparkles, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** §7.4 sidebar order; the mobile tab bar uses the same list. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/library", label: "Library", icon: Library },
  { href: "/create", label: "Create", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];
