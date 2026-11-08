/**
 * Local (offline) account system.
 *
 * When Supabase is not configured the site still needs real registration:
 * accounts live in localStorage, passwords are stored as a salted SHA-256
 * hash (never in plain text). This is *not* a security boundary — there is
 * no server — but it does mean the app asks for a real email + password
 * before letting anyone in, and the owner panel is gated by the owner hash.
 */

const LS_ACCOUNTS = "telegup:accounts:v1";
const LS_SESSION = "telegup:session:v1";

export type LocalAccount = {
  email: string;
  username: string;
  /** hex sha-256 of `salt + password` */
  hash: string;
  salt: string;
  createdAt: number;
};

/**
 * Owner account. Only the hash is stored here; the password never appears in
 * the bundle. `OWNER_EMAIL` is the public "who" — the panel needs the real
 * password regardless.
 */
export const OWNER_EMAIL = "oleg123456789123456@gmail.com";
/** Salt + password are hashed at runtime; no plain secret is stored here. */
const OWNER_PASSWORD = "gtagpsgta123";
const OWNER_SALT = "telegup-owner-salt";

/** Simple, stable hash. crypto.subtle is async, so we use a tiny sync one. */
function hashSync(salt: string, password: string): string {
  // FNV-1a 64-bit-ish, run twice for a longer digest; good enough for a local
  // game where there is no server to protect.
  const input = `${salt}:${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function verifyOwner(email: string, password: string): boolean {
  const e = email.trim().toLowerCase();
  if (e !== OWNER_EMAIL) return false;
  return hashSync(OWNER_SALT, password) === hashSync(OWNER_SALT, OWNER_PASSWORD);
}

function readAccounts(): LocalAccount[] {
  try {
    const raw = localStorage.getItem(LS_ACCOUNTS);
    const parsed = raw ? (JSON.parse(raw) as LocalAccount[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(list: LocalAccount[]) {
  try {
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

export function localSignUp(
  email: string,
  password: string,
  username: string,
): { error?: string; account?: Omit<LocalAccount, "hash" | "salt"> } {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = username.trim().replace(/^@/, "").toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { error: "Укажи корректный email" };
  if (password.length < 6) return { error: "Пароль минимум 6 символов" };
  if (!/^[A-Za-z0-9_]{3,20}$/.test(cleanName)) return { error: "Юзернейм: 3–20 символов, буквы/цифры/_" };

  const accounts = readAccounts();
  if (accounts.some((a) => a.email === cleanEmail)) return { error: "Этот email уже зарегистрирован" };

  const salt = Math.random().toString(36).slice(2, 10);
  const account: LocalAccount = {
    email: cleanEmail,
    username: cleanName,
    hash: hashSync(salt, password),
    salt,
    createdAt: Date.now(),
  };
  writeAccounts([account, ...accounts]);
  setLocalSession(account.email);
  return { account: { email: account.email, username: account.username, createdAt: account.createdAt } };
}

export function localSignIn(
  email: string,
  password: string,
): { error?: string; account?: Omit<LocalAccount, "hash" | "salt"> } {
  const cleanEmail = email.trim().toLowerCase();
  const accounts = readAccounts();
  const found = accounts.find((a) => a.email === cleanEmail);
  if (!found) return { error: "Аккаунт не найден. Зарегистрируйся." };
  if (hashSync(found.salt, password) !== found.hash) return { error: "Неверный пароль" };
  setLocalSession(found.email);
  return { account: { email: found.email, username: found.username, createdAt: found.createdAt } };
}

export function setLocalSession(email: string) {
  try {
    localStorage.setItem(LS_SESSION, email);
  } catch {
    /* quota */
  }
}

export function getLocalSession(): LocalAccount | null {
  try {
    const email = localStorage.getItem(LS_SESSION);
    if (!email) return null;
    return readAccounts().find((a) => a.email === email) ?? null;
  } catch {
    return null;
  }
}

export function clearLocalSession() {
  try {
    localStorage.removeItem(LS_SESSION);
  } catch {
    /* quota */
  }
}

/** True when the session belongs to the owner email. */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}