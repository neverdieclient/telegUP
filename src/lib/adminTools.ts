/**
 * What the owner did, and what the site is doing right now.
 *
 * Two small helpers live here because they are used by the admin console, the
 * maintenance gate and the navigation:
 *
 *  - `logAdmin` — an append-only audit trail of owner actions. A console with
 *    a «обнулить баланс» button needs a list of who pressed it and when, even
 *    when the only user is the owner: it is how you notice a mistake later.
 *  - `maintenanceActive` — the single definition of "the games are closed".
 */

export type AdminLogEntry = {
  at: number;
  /** short action label, e.g. «звёзды», «премиум», «заказ» */
  action: string;
  detail: string;
  /** the account the action applied to */
  target?: string;
};

const LS_LOG = "telegup:adminlog:v1";

export function listAdminLog(): AdminLogEntry[] {
  try {
    const raw = localStorage.getItem(LS_LOG);
    const list = raw ? (JSON.parse(raw) as AdminLogEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function logAdmin(action: string, detail: string, target?: string) {
  try {
    const next = [{ at: Date.now(), action, detail, target }, ...listAdminLog()].slice(0, 300);
    localStorage.setItem(LS_LOG, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export function clearAdminLog() {
  try {
    localStorage.removeItem(LS_LOG);
  } catch {
    /* quota */
  }
}

/* ------------------------------------------------------- quiet window */

/** "HH:MM" → minutes since midnight, or null when unparsable. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export type MaintenanceConfig = {
  maintenance: boolean;
  /** «23:30» — quiet hours begin; empty = not scheduled */
  quietFrom?: string;
  quietTo?: string;
};

/**
 * The games are closed when the owner flipped the switch **or** the clock is
 * inside the scheduled quiet window. A window that crosses midnight
 * («23:30»→«07:00») is handled, because that is the useful one: it covers the
 * night, when nobody is around to answer a broken case.
 */
export function maintenanceActive(cfg: MaintenanceConfig, now = new Date()): boolean {
  if (cfg.maintenance) return true;
  const from = cfg.quietFrom ? toMinutes(cfg.quietFrom) : null;
  const to = cfg.quietTo ? toMinutes(cfg.quietTo) : null;
  if (from === null || to === null || from === to) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}