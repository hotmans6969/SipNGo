import { v4 as uuidv4 } from "uuid";
import getDb from "./db";
import { sql, type Queryable } from "./sql";
import {
  REWARDS,
  SIGNUP_VOUCHER,
  VOUCHER_COLUMNS,
  getReward,
  type VoucherRow,
} from "./rewards";

export * from "./rewards";

/**
 * Vouchers and points redemption.
 *
 * A voucher is either a fixed amount off the order, or one free drink. Both
 * are stored as a row that can be spent exactly once: the redemption is
 * recorded against the order that used it, inside the same transaction that
 * creates the order, so a voucher cannot be applied to two orders even if two
 * checkouts race.
 *
 * Points buy discount vouchers only, and signing up grants a free drink. They
 * are kept separate deliberately — offering both "free drink" and "RM 10 off"
 * for points invites the question of which is worth more, and on this menu the
 * answer changes per drink.
 */

function num(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function normalise(row: VoucherRow): VoucherRow {
  return {
    ...row,
    discount_cents: num(row.discount_cents),
    points_spent: num(row.points_spent),
  };
}

function expiryFrom(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Grants the free drink that comes with signing up.
 *
 * Takes the executor so registration can create it in the same transaction as
 * the account. A voucher must never outlive a failed signup.
 */
export async function grantSignupVoucher(db: Queryable, userId: string): Promise<void> {
  await db.run(
    `INSERT INTO vouchers (id, user_id, kind, discount_cents, label, source, points_spent, expires_at)
     VALUES (?, ?, 'free_drink', 0, ?, 'signup', 0, ?)`,
    [uuidv4(), userId, SIGNUP_VOUCHER.label, expiryFrom(SIGNUP_VOUCHER.validForDays)]
  );
}

/** Vouchers a customer can still spend, soonest to expire first. */
export async function getUsableVouchers(userId: string): Promise<VoucherRow[]> {
  await getDb();
  const rows = await sql.all<VoucherRow>(
    `SELECT ${VOUCHER_COLUMNS} FROM vouchers
      WHERE user_id = ?
        AND redeemed_at IS NULL
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY expires_at IS NULL, expires_at, created_at`,
    [userId]
  );
  return rows.map(normalise);
}

/** Everything ever issued, for the account page's history. */
export async function getAllVouchers(userId: string): Promise<VoucherRow[]> {
  await getDb();
  const rows = await sql.all<VoucherRow>(
    `SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE user_id = ?
      ORDER BY redeemed_at IS NOT NULL, created_at DESC`,
    [userId]
  );
  return rows.map(normalise);
}

export class VoucherError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "VoucherError";
  }
}

/**
 * Exchanges points for a voucher.
 *
 * The whole exchange is one transaction, and the points are deducted with a
 * balance check in the UPDATE itself, so two simultaneous redemptions cannot
 * both succeed off the same balance.
 */
export async function redeemPoints(userId: string, rewardId: string): Promise<VoucherRow> {
  await getDb();
  const reward = getReward(rewardId);
  if (!reward) throw new VoucherError("That reward does not exist", 404);

  const { transaction } = await import("./sql");
  const voucherId = uuidv4();

  await transaction(async (tx) => {
    // The WHERE clause is the guard: it only matches when the balance is
    // genuinely sufficient, so a concurrent redemption cannot overdraw.
    const changed = await tx.run(
      "UPDATE users SET points = points - ? WHERE id = ? AND points >= ?",
      [reward.points, userId, reward.points]
    );

    if (changed === 0) {
      const row = await tx.one<{ points: number }>("SELECT points FROM users WHERE id = ?", [
        userId,
      ]);
      const balance = num(row?.points);
      throw new VoucherError(
        `Not enough points. This reward costs ${reward.points} and you have ${balance}.`
      );
    }

    await tx.run(
      `INSERT INTO vouchers (id, user_id, kind, discount_cents, label, source, points_spent, expires_at)
       VALUES (?, ?, 'discount', ?, ?, 'points', ?, ?)`,
      [
        voucherId,
        userId,
        reward.discountCents,
        reward.label,
        reward.points,
        expiryFrom(reward.validForDays),
      ]
    );
  });

  const created = await sql.one<VoucherRow>(
    `SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE id = ?`,
    [voucherId]
  );
  return normalise(created!);
}

/** Loads a voucher for use, refusing anything not spendable by this customer. */
export async function loadSpendableVoucher(
  tx: Queryable,
  userId: string,
  voucherId: string
): Promise<VoucherRow> {
  const row = await tx.one<VoucherRow>(
    `SELECT ${VOUCHER_COLUMNS} FROM vouchers WHERE id = ?`,
    [voucherId]
  );
  if (!row) throw new VoucherError("Voucher not found", 404);
  if (row.user_id !== userId) throw new VoucherError("Voucher not found", 404);
  if (row.redeemed_at) throw new VoucherError("That voucher has already been used");
  if (row.expires_at && new Date(row.expires_at.replace(" ", "T") + "Z") <= new Date()) {
    throw new VoucherError("That voucher has expired");
  }
  return normalise(row);
}

/** Marks a voucher spent. Call inside the order's transaction. */
export async function markVoucherUsed(
  tx: Queryable,
  voucherId: string,
  orderId: string
): Promise<void> {
  const changed = await tx.run(
    `UPDATE vouchers SET redeemed_at = datetime('now'), order_id = ?
      WHERE id = ? AND redeemed_at IS NULL`,
    [orderId, voucherId]
  );
  // Zero rows means another checkout claimed it first.
  if (changed === 0) throw new VoucherError("That voucher has already been used");
}

/** Returns a voucher to the customer when their order is cancelled. */
export async function releaseVoucherForOrder(tx: Queryable, orderId: string): Promise<void> {
  await tx.run(
    "UPDATE vouchers SET redeemed_at = NULL, order_id = NULL WHERE order_id = ?",
    [orderId]
  );
}
