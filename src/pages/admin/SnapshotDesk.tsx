import { useState } from "react";
import { useGame } from "../../store/useGame";
import { getScope, readAccountState, writeAccountState } from "../../lib/scopedStorage";
import { logAdmin } from "../../lib/adminTools";
import { Button } from "../../components/ui/Button";

/**
 * Account snapshots — a «before» photo of a save.
 *
 * The console has buttons that wipe an inventory or zero a balance, and those
 * are one misclick away from a support conversation that cannot be undone. A
 * snapshot copies the account's saved state, so the owner can say «let me put
 * that back» instead of «sorry».
 *
 * Snapshots are kept per account slot and capped at five: enough to cover a
 * mistake, not enough to be a general backup system (the cloud save is that).
 */

const LS_KEY = "telegup:snapshots:v1";
const KEEP = 5;

type Snapshot = {
  id: string;
  at: number;
  scope: string;
  /** human line: stars, items, premium */
  summary: string;
  state: Record<string, unknown>;
};

type Book = Record<string, Snapshot[]>;

function readBook(): Book {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Book) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBook(book: Book) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(book));
  } catch {
    /* quota — a snapshot is a large object, the oldest ones are dropped first */
  }
}

function summarize(state: Record<string, unknown>): string {
  const stars = typeof state.stars === "number" ? state.stars : 0;
  const ton = typeof state.ton === "number" ? state.ton : 0;
  const items = Array.isArray(state.inventory) ? state.inventory.length : 0;
  const until = typeof state.premiumUntil === "number" ? state.premiumUntil : null;
  const premium = until && until > Date.now() ? " · premium" : "";
  return `${stars.toLocaleString("ru-RU")} ★ · ${ton} TON · ${items} подарков${premium}`;
}

export function SnapshotDesk() {
  const toast = useGame((s) => s.toast);
  const adminReset = useGame((s) => s.adminReset);
  const [book, setBook] = useState<Book>(readBook);
  const scope = getScope();
  const mine = book[scope] ?? [];

  const take = () => {
    const state = readAccountState(scope);
    if (!state) {
      toast({ kind: "error", title: "Нечего сохранять", message: "Сохранение этого аккаунта не найдено" });
      return;
    }
    const snap: Snapshot = {
      id: `snap-${Date.now().toString(36)}`,
      at: Date.now(),
      scope,
      summary: summarize(state),
      state,
    };
    const next: Book = { ...book, [scope]: [snap, ...mine].slice(0, KEEP) };
    writeBook(next);
    setBook(next);
    logAdmin("снимок", `создан · ${snap.summary}`);
    toast({ kind: "success", title: "Снимок готов", message: snap.summary });
  };

  const restore = (snap: Snapshot) => {
    writeAccountState(scope, snap.state);
    logAdmin("снимок", `восстановлен от ${new Date(snap.at).toLocaleString("ru-RU")}`);
    toast({ kind: "info", title: "Восстанавливаем", message: "Страница перезагрузится с этим снимком" });
    window.setTimeout(() => window.location.reload(), 500);
  };

  const drop = (id: string) => {
    const next: Book = { ...book, [scope]: mine.filter((s) => s.id !== id) };
    writeBook(next);
    setBook(next);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] leading-snug text-white/35">
          Копия сохранения этого аккаунта: звёзды, TON, инвентарь, профиль.
        </p>
        <Button size="sm" onClick={take}>
          Снимок
        </Button>
      </div>

      {mine.length === 0 ? (
        <p className="rounded-xl border border-white/7 bg-white/[0.02] px-3 py-4 text-center text-[10.5px] text-white/25">
          Снимков пока нет
        </p>
      ) : (
        <div className="space-y-1.5">
          {mine.map((snap) => (
            <div
              key={snap.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold tabular-nums">{snap.summary}</p>
                <p className="text-[9.5px] text-white/25">
                  {new Date(snap.at).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => restore(snap)}
                  className="rounded-md border border-white/12 px-1.5 py-0.5 text-[9.5px] font-bold text-white/55 hover:text-white"
                >
                  вернуть
                </button>
                <button
                  onClick={() => drop(snap.id)}
                  className="rounded-md border border-white/10 px-1.5 py-0.5 text-[9.5px] font-bold text-white/30 hover:text-mythic"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          adminReset();
          toast({ kind: "info", title: "Аккаунт сброшен" });
        }}
        className="w-full rounded-xl border border-mythic/25 bg-mythic/[0.07] px-3 py-2 text-[10.5px] font-bold text-mythic/80 hover:bg-mythic/15"
      >
        Сбросить аккаунт (после снимка это можно отменить)
      </button>
    </div>
  );
}