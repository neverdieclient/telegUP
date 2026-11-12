import type { StateStorage } from "zustand/middleware";
import { onlineEnabled } from "./supabase";
import { getLocalSession } from "./localAuth";

/**
 * Every account keeps its own local save.
 *
 * The whole game state used to sit in one localStorage entry shared by the
 * entire browser, so signing up a second account started with the first
 * one's stars, gifts and cosmetics — and the cloud pull could only ever grow
 * those numbers, never reset them. Now every account owns a slot:
 *
 *   telegup:state:v2:u:<uuid>   — an online (Supabase) account
 *   telegup:state:v2:l:<email>   — an offline (local) account
 *   telegup:state:v2:guest      — nobody is signed in
 *
 * Switching accounts swaps the whole save: a brand new account starts from
 * zero and the account you come back to is restored exactly as it was left.
 * Device preferences (theme, sound, device) stay shared by every account.
 */

/** The logical key zustand persists under. */
export const STORE_KEY = "telegup:state:v2";
/** The save that predates the per-account split. */
const LEGACY_KEY = STORE_KEY;
/** Device preferences — shared by every account on this device. */
const DEVICE_KEY = `${STORE_KEY}:__device`;
/** Which account's slot to open on boot. */
const LAST_SCOPE_KEY = "telegup:last-scope:v1";

/**
 * Fields that belong to the device, not to one account.
 *
 * The admin switches are the owner's own device settings (the maintenance
 * screen is a site-wide switch, the owner's cheat toggles live in the panel
 * on that machine). The luck boost inside `admin` is granted per player, so
 * the store resets it when the account changes — the gift inbox fetches the
 * right value right away.
 */
export const DEVICE_FIELDS = [
  "admin",
  "settings",
  "theme",
  "deviceMode",
  "deviceChosen",
] as const;

const DEVICE_SET: ReadonlySet<string> = new Set<string>(DEVICE_FIELDS);

export const GUEST_SCOPE = "guest";

/** Scope of an online account (the Supabase user id). */
export function onlineScope(userId: string): string {
  return `u:${userId}`;
}

/** Scope of an offline account (the email it registered with). */
export function localScope(email: string): string {
  return `l:${email.trim().toLowerCase()}`;
}

type Persisted = { state: Record<string, unknown>; version?: number };

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

function parse(raw: string | null): Persisted | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || typeof parsed !== "object" || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** localStorage key of one account's slot. */
function accountKey(scope: string): string {
  return `${STORE_KEY}:${scope}`;
}

/** Split a save into the part that belongs to the account and the device part. */
function splitState(state: Record<string, unknown>): {
  account: Record<string, unknown>;
  device: Record<string, unknown>;
} {
  const account: Record<string, unknown> = {};
  const device: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (DEVICE_SET.has(key)) device[key] = value;
    else account[key] = value;
  }
  return { account, device };
}

let currentScope: string = GUEST_SCOPE;

/**
 * The slot that opens on boot.
 *
 * The save that predates the split is moved into the account it belonged to
 * (it remembers its owner), so nobody loses their progress on the update.
 */
function initialScope(): string {
  const legacy = parse(safeGet(LEGACY_KEY));
  if (legacy) {
    const owner = legacy.state.onlineUserId;
    const local = onlineEnabled ? null : getLocalSession()?.email;
    const scope =
      typeof owner === "string" && owner
        ? onlineScope(owner)
        : local
          ? localScope(local)
          : GUEST_SCOPE;
    const { account, device } = splitState(legacy.state);
    safeSet(accountKey(scope), JSON.stringify({ state: account, version: legacy.version }));
    safeSet(DEVICE_KEY, JSON.stringify({ state: device, version: legacy.version }));
    safeRemove(LEGACY_KEY);
    safeSet(LAST_SCOPE_KEY, scope);
    return scope;
  }
  if (!onlineEnabled) {
    const local = getLocalSession()?.email;
    return local ? localScope(local) : GUEST_SCOPE;
  }
  // online the session is not readable synchronously, so we open the account
  // that was active last and swap the slot the moment the account is known
  return safeGet(LAST_SCOPE_KEY) || GUEST_SCOPE;
}

try {
  currentScope = initialScope();
} catch {
  currentScope = GUEST_SCOPE;
}

/** The slot that is currently open. */
export function getScope(): string {
  return currentScope;
}

/** Point the storage at another slot (and remember it for the next boot). */
export function setScope(scope: string): void {
  currentScope = scope;
  safeSet(LAST_SCOPE_KEY, scope);
}

/** The saved state of one account (without the shared device part). */
export function readAccountState(scope: string): Record<string, unknown> | null {
  return parse(safeGet(accountKey(scope)))?.state ?? null;
}

/** The last device part we wrote — the device slot only changes with the theme. */
let lastDeviceRaw: string | null = null;

/**
 * localStorage adapter that routes the account part of the save to the
 * account that is currently open and keeps the device preferences shared.
 */
export const scopedStorage: StateStorage = {
  getItem: () => {
    const acc = parse(safeGet(accountKey(currentScope)));
    const dev = parse(safeGet(DEVICE_KEY));
    if (!acc && !dev) return null;
    const state = { ...(dev?.state ?? {}), ...(acc?.state ?? {}) };
    return JSON.stringify({ state, version: acc?.version ?? dev?.version ?? 0 });
  },
  setItem: (_name, value) => {
    const parsed = parse(value);
    if (!parsed) return;
    const { account, device } = splitState(parsed.state);
    safeSet(accountKey(currentScope), JSON.stringify({ state: account, version: parsed.version }));
    const deviceRaw = JSON.stringify({ state: device, version: parsed.version });
    if (deviceRaw !== lastDeviceRaw) {
      safeSet(DEVICE_KEY, deviceRaw);
      lastDeviceRaw = deviceRaw;
    }
  },
  removeItem: () => {
    safeRemove(accountKey(currentScope));
    safeRemove(DEVICE_KEY);
  },
};
