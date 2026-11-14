import { supabase } from "./supabase";

/**
 * Глобальные настройки магазина подарков (общие для всех пользователей).
 * Хранятся в Supabase (таблица app_config), поэтому ограничения владельца
 * действуют у всех, а не только в его браузере.
 */
export type GiftAppConfig = {
  giftBuyEnabled: boolean;
  giftUpgradesEnabled: boolean;
  upgradeOnly: string[];
};

export const DEFAULT_GIFT_CONFIG: GiftAppConfig = {
  giftBuyEnabled: true,
  giftUpgradesEnabled: true,
  upgradeOnly: [],
};

type Row = {
  gift_buy_enabled: boolean | null;
  gift_upgrades_enabled: boolean | null;
  upgrade_only: string[] | null;
};

function normalize(row: Row | null | undefined): GiftAppConfig {
  if (!row) return { ...DEFAULT_GIFT_CONFIG };
  return {
    giftBuyEnabled:
      typeof row.gift_buy_enabled === "boolean" ? row.gift_buy_enabled : true,
    giftUpgradesEnabled:
      typeof row.gift_upgrades_enabled === "boolean"
        ? row.gift_upgrades_enabled
        : true,
    upgradeOnly: Array.isArray(row.upgrade_only) ? row.upgrade_only : [],
  };
}

export async function fetchGiftAppConfig(): Promise<GiftAppConfig | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("app_config")
    .select("gift_buy_enabled,gift_upgrades_enabled,upgrade_only")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return normalize(data as Row);
}

export async function saveGiftAppConfig(
  patch: Partial<GiftAppConfig>,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "offline" };
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.giftBuyEnabled === "boolean")
    body.gift_buy_enabled = patch.giftBuyEnabled;
  if (typeof patch.giftUpgradesEnabled === "boolean")
    body.gift_upgrades_enabled = patch.giftUpgradesEnabled;
  if (Array.isArray(patch.upgradeOnly)) body.upgrade_only = patch.upgradeOnly;

  const { error } = await supabase.from("app_config").update(body).eq("id", 1);
  if (error) return { error: error.message };
  return {};
}
