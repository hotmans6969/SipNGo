"use client";

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending_payment: { label: "Pending Payment", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  paid: { label: "Paid", className: "bg-blue-100 text-blue-800 border-blue-300" },
  preparing: { label: "Preparing", className: "bg-orange-100 text-orange-800 border-orange-300" },
  ready: { label: "Ready for Pickup", className: "bg-green-100 text-green-800 border-green-300" },
  picked_up: { label: "Picked Up", className: "bg-stone-100 text-stone-600 border-stone-300" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 border-red-300" },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-stone-100 text-stone-600 border-stone-300",
  };

  // "Ready" is the only status a customer is actively waiting for, so it is
  // the only one that keeps moving. Animating the rest would just be noise on
  // a screen that refreshes every few seconds.
  //
  // animate-ready-pulse already includes the scale-in entrance, because two
  // animate-* utilities on one element clobber each other.
  const entrance = status === "ready" ? "animate-ready-pulse" : "animate-scale-in";

  return (
    <span
      key={status}
      className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${config.className} ${entrance}`}
    >
      {config.label}
    </span>
  );
}
