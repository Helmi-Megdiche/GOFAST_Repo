import type { ProfilePort } from "@/lib/data/ports";

/** The screens of the `account` flag that need a route the API may not have yet (20-d switch plan). */
export type AccountFeature = "home" | "email" | "addressBook" | "invoices" | "claims";

export function featureAvailable(port: ProfilePort, feature: AccountFeature): boolean {
  switch (feature) {
    case "home":
      return port.homeAvailable;
    case "email":
      return port.emailAvailable;
    case "addressBook":
      return port.addressBookAvailable;
    case "invoices":
      return port.invoicesAvailable;
    case "claims":
      return port.claimsAvailable;
  }
}
