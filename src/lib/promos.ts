/**
 * Promo codes.
 *
 * The owner generates a code, the player types it in. A code is either star
 * money, TON, or days of premium; every code has a limited number of uses so a
 * leaked one cannot drain the economy.
 *
 * Storage is local on purpose (`telegup:promos:v1`): the codes are handed out
 * in the channel, and the same browser that created a code is the one that can
 * redeem it. When the owner starts handing codes to strangers, the list moves
 * into Supabase next to `shop_orders` — the shape below is already the row.
 */

export type PromoKind = "stars" | "ton" | "premium";

export type Promo = {
  code: string;
  kind: PromoKind;
  /** stars / TON amount, or days of premium */
  amount: number;
  /** how many accounts may use it */
  usesLeft: number;
  createdAt: number;
  note?: string;
};

const LS_PROMOS = "telegup:promos:v1";
const LS_REDEEMED = "telegup:promos:redeemed:v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function listPromos(): Promo[] {
  const list = read<Promo[]>(LS_PROMOS, []);
  return Array.isArray(list) ? list : [];
}

/** `TELEGUP-XXXX`: readable over a voice call, no look-alike characters. */
export function generatePromoCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < 6; i++) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `TELEGUP-${body}`;
}

export function createPromo(input: { kind: PromoKind; amount: number; uses: number; note?: string }): Promo {
  const promo: Promo = {
    code: generatePromoCode(),
    kind: input.kind,
    amount: Math.max(1, Math.round(input.amount)),
    usesLeft: Math.max(1, Math.round(input.uses)),
    createdAt: Date.now(),
    note: input.note,
  };
  write(LS_PROMOS, [promo, ...listPromos()].slice(0, 100));
  return promo;
}

export function deletePromo(code: string) {
  write(
    LS_PROMOS,
    listPromos().filter((p) => p.code !== code),
  );
}

/** Codes this browser already used, so the same account cannot reuse one. */
export function redeemedCodes(scope: string): string[] {
  const map = read<Record<string, string[]>>(LS_REDEEMED, {});
  return map[scope] ?? [];
}

export type PromoResult =
  | { ok: true; promo: Promo }
  | { ok: false; reason: "empty" | "missing" | "used" | "spent" };

/**
 * Validate a code without granting anything.
 *
 * Separated from the granting so the store (which owns the balances) is the
 * single place that writes to an account — the same split as orders.
 */
export function checkPromo(rawCode: string, scope: string): PromoResult {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "empty" };
  const promo = listPromos().find((p) => p.code === code);
  if (!promo) return { ok: false, reason: "missing" };
  if (redeemedCodes(scope).includes(code)) return { ok: false, reason: "used" };
  if (promo.usesLeft <= 0) return { ok: false, reason: "spent" };
  return { ok: true, promo };
}

/** Burn one use of a validated code for this account. */
export function consumePromo(code: string, scope: string) {
  const clean = code.trim().toUpperCase();
  write(
    LS_PROMOS,
    listPromos().map((p) => (p.code === clean ? { ...p, usesLeft: Math.max(0, p.usesLeft - 1) } : p)),
  );
  const map = read<Record<string, string[]>>(LS_REDEEMED, {});
  map[scope] = [...(map[scope] ?? []), clean];
  write(LS_REDEEMED, map);
}