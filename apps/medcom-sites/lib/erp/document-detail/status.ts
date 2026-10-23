import { statusColorsFrom } from "../status-colors";
import type { DocumentDetailModel } from "./model";

/** Presentation data only; action permissions and lock interpretation stay in the controllers. */
export function detailStatus(header: Record<string, unknown>, label: string | null, locked: boolean | null): DocumentDetailModel["status"] {
  const delivery = typeof header.deliveryStatusName === "string" ? header.deliveryStatusName : "";
  return { label, locked, style: statusColorsFrom(header), badges: delivery.trim() ? [{
    id: "delivery", title: "Trạng thái giao hàng", label: `Giao hàng: ${delivery}`,
    style: statusColorsFrom(header, "deliveryStatusForeColor", "deliveryStatusBackColor"),
  }] : [] };
}
