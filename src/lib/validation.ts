import { z } from "zod";
import { NextResponse } from "next/server";
import { ORDER_STATUSES } from "./order-status";
import { TOPPING_IDS, MAX_TOPPINGS_PER_ITEM } from "./toppings";
import { PAYMENT_METHODS } from "./payment-methods";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(254),
  name: z.string().trim().min(1, "Name is required").max(80),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email or password").max(254),
  password: z.string().min(1, "Invalid email or password").max(200),
});

export const cartItemSchema = z.object({
  menuItemId: z.string().uuid("Invalid menu item"),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(50),
  sugarLevel: z.string().trim().max(40).optional(),
  temperature: z.enum(["hot", "iced"]).optional(),
  remark: z.string().trim().max(200).optional(),
  // The cap comes from the catalogue rather than a hardcoded number, so
  // adding a topping does not silently leave this behind. Order creation
  // normalises the list again regardless of what arrives here.
  toppings: z
    .array(z.enum(TOPPING_IDS as [string, ...string[]]))
    .max(MAX_TOPPINGS_PER_ITEM, `Choose at most ${MAX_TOPPINGS_PER_ITEM} toppings`)
    .optional(),
});

export const createOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Cart is empty").max(50),
  // Ownership, expiry and whether it has already been spent are all checked
  // server-side when the order is created.
  voucherId: z.string().uuid("Invalid voucher").optional(),
});

export const checkoutSchema = z.object({
  orderId: z.string().uuid("Invalid order"),
  // Defaulted so an older client, or the retry button on an order that
  // predates the portal, still reaches the card flow it used to get.
  method: z.enum(PAYMENT_METHODS).default("card"),
});

/** Prices are whole sen, must be positive, and are capped to catch typos. */
const priceCents = z
  .number()
  .int("Price must be a whole number of sen")
  .positive("Price must be greater than zero")
  .max(1_000_000, "Price is unreasonably large");

const menuCategory = z.enum(["coffee", "tea", "smoothies", "juices", "pastries", "food"]);

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(300).optional().default(""),
  priceCents,
  category: menuCategory,
  imageUrl: z.string().trim().max(500).optional(),
});

export const updateMenuItemSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).optional(),
    priceCents: priceCents.optional(),
    category: menuCategory.optional(),
    imageUrl: z.string().trim().max(500).optional(),
    available: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

export const adminUpdateOrderSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    qrToken: z.string().uuid().optional(),
  })
  .refine((data) => data.status !== undefined || data.qrToken !== undefined, {
    message: "Either status or qrToken is required",
  });

export const orderQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Parses a JSON request body against a schema, returning either the typed data
 * or a ready-to-send 400. Keeps every route's validation shape identical.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T>; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request";
    return { data: null, error: NextResponse.json({ error: message }, { status: 400 }) };
  }

  return { data: result.data, error: null };
}

/** Parses URL search params against a schema. */
export function parseQuery<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): { data: z.infer<T>; error: null } | { data: null; error: NextResponse } {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid query";
    return { data: null, error: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { data: result.data, error: null };
}
