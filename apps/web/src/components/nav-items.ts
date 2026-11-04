/** Header navigation. Zones, contact, driver and legal pages have no entry (they are reached from the page content and the footer). */
export const NAV_ITEMS = [
  { key: "home", href: "/" },
  { key: "services", href: "/services" },
  { key: "merchants", href: "/commercants" },
  { key: "tracking", href: "/suivi" },
  { key: "help", href: "/aide" },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
