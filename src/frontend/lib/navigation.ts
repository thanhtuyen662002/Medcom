import type { Workspace } from "./contracts.ts";

// The API may advertise known screens implemented by the separate frontend.
// Only these exact id/href pairs have a renderer in this bundled client.
const supportedRoutes = {
  "platform-status": "/workspace/",
  "purchase-orders": "/workspace/?screen=purchase-orders",
  "inbound-requests": "/workspace/?screen=inbound-requests",
} as const;
export function supportedNavigation(navigation: Workspace["navigation"]) {
  return navigation.filter(item => Object.entries(supportedRoutes).some(
    ([id, href]) => item.id === id && item.href === href));
}
export function documentScreenFor(screen: string, navigation: Workspace["navigation"]) {
  return (screen === "purchase-orders" || screen === "inbound-requests") &&
    supportedNavigation(navigation).some(item => item.id === screen) ? screen : null;
}
