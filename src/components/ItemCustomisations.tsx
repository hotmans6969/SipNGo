import { formatToppings, parseToppings } from "@/lib/toppings";

interface Props {
  temperature?: string | null;
  sugarLevel?: string | null;
  /** JSON array of topping ids, as stored on the order line. */
  toppings?: string | null;
  remark?: string | null;
  /** Larger, higher-contrast rendering for the counter. */
  emphasis?: boolean;
}

/**
 * The choices attached to one order line.
 *
 * Shared because the counter and the customer must see the same thing: staff
 * cannot make a drink without knowing its toppings, and a customer needs to
 * check what they ordered. Neither view showed any of this before toppings
 * existed, which would have made the feature unusable in the shop.
 */
export default function ItemCustomisations({
  temperature,
  sugarLevel,
  toppings,
  remark,
  emphasis = false,
}: Props) {
  const chosen = parseToppings(toppings ?? null);
  const hasAny = temperature || sugarLevel || chosen.length > 0 || remark;
  if (!hasAny) return null;

  const chip = emphasis
    ? "text-sm px-2.5 py-1 rounded-full font-medium"
    : "text-xs px-2 py-0.5 rounded-full";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${emphasis ? "mt-2" : "mt-1"}`}>
      {temperature && (
        <span className={`bg-stone-100 text-stone-600 ${chip}`}>
          {temperature === "iced" ? "❄️ Iced" : "☕ Hot"}
        </span>
      )}
      {sugarLevel && (
        <span className={`bg-stone-100 text-stone-600 capitalize ${chip}`}>
          {sugarLevel} sugar
        </span>
      )}
      {chosen.length > 0 && (
        // Toppings are what staff most need to spot, so they carry the only
        // coloured chip in the row.
        <span className={`bg-amber-100 text-amber-800 font-semibold ${chip}`}>
          + {formatToppings(chosen)}
        </span>
      )}
      {remark && (
        <span className={`italic text-stone-500 ${emphasis ? "text-sm" : "text-xs"}`}>
          “{remark}”
        </span>
      )}
    </div>
  );
}
