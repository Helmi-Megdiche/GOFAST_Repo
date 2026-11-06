import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@fastgo/ui";
import type { OrderStatus } from "@/lib/data/states";

const LOOK: Record<
  OrderStatus,
  { tone: BadgeTone; icon: "clock" | "truck" | "check" | "x" | "warn" }
> = {
  received: { tone: "warning", icon: "clock" },
  confirmed: { tone: "warning", icon: "clock" },
  assigned: { tone: "warning", icon: "clock" },
  pickup_failed: { tone: "danger", icon: "warn" },
  picked_up: { tone: "info", icon: "truck" },
  in_transit: { tone: "info", icon: "truck" },
  delivered: { tone: "success", icon: "check" },
  partially_delivered: { tone: "warning", icon: "check" },
  returned: { tone: "danger", icon: "x" },
  lost: { tone: "danger", icon: "warn" },
  canceled: { tone: "neutral", icon: "x" },
};

/** The state of an order as a badge, with the cahier's name for it (`orders.status.*`). */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("orders.status");
  return (
    <Badge tone={LOOK[status].tone} icon={LOOK[status].icon}>
      {t(status)}
    </Badge>
  );
}
