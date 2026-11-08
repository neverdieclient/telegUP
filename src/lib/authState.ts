import { supabase } from "./supabase";

/**
 * A tiny global auth cache.
 *
 * `useAuth()` is a hook, so it may only be called inside components. Routes,
 * guards and redirects need the same answer synchronously, so this module
 * keeps one subscription and exposes the latest snapshot through a listener.
 */

type Snapshot = { checked: boolean; authed: boolean; userId: string | null };

const listeners = new Set<(s: Snapshot) => void>();

const state: Snapshot = {
  // without a backend nothing is checked: local-only mode is always "authed"
  checked: false,
  authed: false,
  userId: null,
};

function emit() {
  for (const l of listeners) l({ ...state });
}

export const paths = {
  get checked() {
    return state.checked;
  },
  get authed() {
    return state.authed;
  },
  get userId() {
    return state.userId;
  },
  subscribe(fn: (s: Snapshot) => void) {
    listeners.add(fn);
    fn({ ...state });
    return () => {
      listeners.delete(fn);
    };
  },
  /** Synchronous check for event handlers. */
  isAuthed() {
    return state.authed;
  },
};

function apply(session: { user?: { id: string } | null } | null) {
  state.userId = session?.user?.id ?? null;
  state.authed = Boolean(state.userId);
  state.checked = true;
  emit();
}

if (supabase) {
  supabase.auth.getSession().then(({ data }) => apply(data.session));
  supabase.auth.onAuthStateChange((_event, session) => apply(session));
} else {
  // local-only mode: pretend to be signed in so the app keeps working
  state.checked = true;
  state.authed = true;
  emit();
}