import { supabase } from "./supabase";

/**
 * Глобальные промокоды (Supabase).
 *
 * Раньше коды и активации жили в localStorage — поэтому на другом аккаунте/
 * устройстве код «не находился». Теперь список и списание использований общие,
 * активация атомарна (RPC redeem_promo).
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

export type PromoResult =
  | { ok: true; promo: Promo }
  | { ok: false; reason: "empty" | "missing" | "used" | "spent" | "auth" | "offline" | "error" };

type PromoRow = {
  code: string;
  kind: string;
  amount: number;
  uses_left: number;
  note: string | null;
  created_at: string;
};

function toPromo(r: PromoRow): Promo {
  return {
    code: r.code,
    kind: r.kind as PromoKind,
    amount: r.amount,
    usesLeft: r.uses_left,
    createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
    note: r.note ?? undefined,
  };
}

/** `TELEGUP-XXXX`: читается по звонку, без похожих символов. */
export function generatePromoCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < 6; i++) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `TELEGUP-${body}`;
}

export async function listPromos(): Promise<Promo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("promo_codes")
    .select("code,kind,amount,uses_left,note,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return (data as PromoRow[]).map(toPromo);
}

export async function createPromo(input: {
  kind: PromoKind;
  amount: number;
  uses: number;
  note?: string;
}): Promise<{ promo?: Promo; error?: string }> {
  if (!supabase) return { error: "Нет подключения к Supabase" };
  const promo: Promo = {
    code: generatePromoCode(),
    kind: input.kind,
    amount: Math.max(1, Math.round(input.amount)),
    usesLeft: Math.max(1, Math.round(input.uses)),
    createdAt: Date.now(),
    note: input.note?.trim() || undefined,
  };
  const { error } = await supabase.from("promo_codes").insert({
    code: promo.code,
    kind: promo.kind,
    amount: promo.amount,
    uses_left: promo.usesLeft,
    note: promo.note ?? null,
  });
  if (error) return { error: error.message };
  return { promo };
}

export async function deletePromo(code: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Нет подключения к Supabase" };
  const { error } = await supabase.from("promo_codes").delete().eq("code", code);
  if (error) return { error: error.message };
  return {};
}

/** Атомарная активация на сервере (проверка, списание, защита от повтора). */
export async function redeemPromo(rawCode: string): Promise<PromoResult> {
  if (!supabase) return { ok: false, reason: "offline" };
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "empty" };
  const { data, error } = await supabase.rpc("redeem_promo", { raw_code: code });
  if (error || !data) return { ok: false, reason: "error" };
  const res = data as { ok: boolean; reason?: string; promo?: any };
  if (!res.ok) return { ok: false, reason: (res.reason as PromoResult extends { ok: false; reason: infer R } ? R : never) || "error" };
  const p = res.promo;
  return {
    ok: true,
    promo: {
      code: p.code,
      kind: p.kind as PromoKind,
      amount: p.amount,
      usesLeft: p.usesLeft ?? p.uses_left ?? 0,
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
      note: p.note ?? undefined,
    },
  };
}
