import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { BADGE_BY_ID, type BadgeId } from "../data/gifts";
import { useGame } from "../store/useGame";
import { CheckMark } from "../components/ui/CheckMark";
import {
  fetchChat,
  fetchPlayer,
  postChat,
  useAuth,
  type ChatRow,
  type PlayerRow,
} from "../lib/players";
import { onlineEnabled } from "../lib/supabase";

/** How often the open chat re-reads new messages. */
const POLL_MS = 5_000;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? time : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${time}`;
}

/** Small card that opens when a chat author is clicked. */
function AuthorCard({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<PlayerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const me = useGame((s) => s.onlineUserId);
  const profile = useGame((s) => s.profile);
  const stars = useGame((s) => s.stars);

  useEffect(() => {
    let dead = false;
    if (!onlineEnabled) {
      setLoading(false);
      return;
    }
    fetchPlayer(id).then((row) => {
      if (dead) return;
      setP(row);
      setLoading(false);
    });
    return () => {
      dead = true;
    };
  }, [id]);

  const self = id === me;
  const nick = self ? profile.nickname : p?.nickname ?? "—";
  const marks = self ? profile.marks : p?.marks ?? [];
  const badges = (self ? profile.badges : p?.badges ?? []) as BadgeId[];
  const bio = self ? profile.bio : p?.bio ?? null;
  const phone = self ? profile.phoneNumber : p?.phone_number ?? null;
  const alt = self ? profile.altNames : p?.alt_names ?? [];
  const value = self
    ? 0
    : p?.inventory_value ?? 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-ink-2/95 shadow-2xl"
        initial={{ scale: 0.94, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 14 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-24 bg-gradient-to-br from-violet to-[#3f2299]">
          <div className="absolute -bottom-8 left-4 grid size-16 place-items-center rounded-2xl border-4 border-ink-2 bg-gradient-to-br from-violet to-[#3f2299] font-display text-2xl font-black">
            {nick.slice(0, 1).toUpperCase()}
          </div>
        </div>
        <div className="px-4 pb-4 pt-10">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-lg font-extrabold">{nick}</h3>
            {marks.includes("basic") && <CheckMark kind="basic" size={16} />}
          </div>
          <p className="mt-0.5 text-[12px] font-bold text-sky-400">@{p?.username?.toLowerCase() ?? nick.toLowerCase()}</p>
          {alt.length > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-sky-400/70">
              а также {alt.map((n) => `@${n.replace(/^@/, "")}`).join(", ")}
            </p>
          )}
          {phone && <p className="mt-1 text-[11.5px] tabular-nums text-white/45">{phone}</p>}
          {bio && <p className="mt-2 text-[12px] leading-relaxed text-white/60">{bio}</p>}

          {loading ? (
            <p className="mt-3 text-[11px] text-white/30">загрузка…</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/25">коллекция</p>
                <p className="text-[12.5px] font-extrabold tabular-nums text-white/80">
                  {(self ? 0 : value).toLocaleString("ru-RU")}★
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/25">предметов</p>
                <p className="text-[12.5px] font-extrabold tabular-nums text-white/80">
                  {self ? 0 : p?.items ?? 0}
                </p>
              </div>
            </div>
          )}

          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {badges.map((b) => {
                const meta = BADGE_BY_ID[b];
                if (!meta) return null;
                return (
                  <span
                    key={b}
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: `${meta.color}22`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                );
              })}
            </div>
          )}

          {self && (
            <p className="mt-3 text-[10.5px] text-white/25">
              Это ты · {stars.toLocaleString("ru-RU")}★ на балансе
            </p>
          )}

          <button
            onClick={onClose}
            className="mt-3 w-full rounded-xl bg-white/10 py-2 text-[12px] font-bold text-white/80 hover:bg-white/15"
          >
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const profile = useGame((s) => s.profile);
  const toast = useGame((s) => s.toast);

  const [rows, setRows] = useState<ChatRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [openAuthor, setOpenAuthor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  // local echo, so the chat is usable without the backend too
  const [localRows, setLocalRows] = useState<ChatRow[]>([]);

  const merged = useMemo(() => {
    if (!onlineEnabled) return localRows;
    const seen = new Set(rows.map((r) => r.id));
    return [...rows, ...localRows.filter((r) => !seen.has(r.id))].slice(-300);
  }, [rows, localRows]);

  useEffect(() => {
    if (!onlineEnabled) return;
    let dead = false;
    const tick = async () => {
      const next = await fetchChat(150);
      if (!dead) setRows(next);
    };
    void tick();
    const t = window.setInterval(tick, POLL_MS);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [merged.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    const nick = profile.nickname || (user?.email?.split("@")[0] ?? "player");

    if (!onlineEnabled || !user) {
      // offline: keep it in this browser so the screen still works
      setLocalRows((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          user_id: "local",
          nickname: nick,
          body,
          created_at: new Date().toISOString(),
        },
      ]);
      setText("");
      return;
    }

    setSending(true);
    const res = await postChat(body, nick);
    setSending(false);
    if (res.error) {
      toast({ kind: "error", title: "Не отправилось", message: res.error });
      return;
    }
    setText("");
    const next = await fetchChat(150);
    setRows(next);
  };

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[420px] flex-col space-y-3">
      <header className="shrink-0">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/40">Commons</p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-tight">Общий чат</h1>
        <p className="mt-1 text-[12px] text-white/35">
          Пишут все. Нажми на имя, чтобы посмотреть профиль игрока.
        </p>
      </header>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-3xl border border-white/8 bg-white/[0.02] p-3"
      >
        {merged.length === 0 && (
          <div className="grid h-full place-items-center">
            <p className="text-center text-[12px] text-white/25">
              {onlineEnabled ? "Пока тихо. Скажи первое слово." : "Чат онлайн-режима не подключён — сообщения видны только тебе."}
            </p>
          </div>
        )}
        {merged.map((m) => {
          const mine = m.user_id === (user?.id ?? "local") || String(m.id).startsWith("local-");
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                  mine
                    ? "bg-neon/12 ring-1 ring-neon/25"
                    : "bg-white/[0.05] ring-1 ring-white/8"
                }`}
              >
                <div className={`flex items-center gap-1.5 ${mine ? "justify-end" : ""}`}>
                  <button
                    onClick={() => setOpenAuthor(m.user_id)}
                    disabled={String(m.id).startsWith("local-")}
                    className={`truncate text-[11px] font-extrabold ${
                      mine ? "text-neon/90" : "text-sky-400 hover:underline"
                    }`}
                  >
                    {m.nickname}
                  </button>
                  <span className="shrink-0 text-[9.5px] tabular-nums text-white/25">
                    {fmtTime(m.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-snug text-white/85">
                  {m.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Написать в общий чат…"
          className="flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] text-white/90 outline-none placeholder:text-white/20 focus:border-neon/40"
        />
        <button
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-2xl bg-neon/90 text-ink transition hover:bg-neon disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
            <path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2Z" />
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {openAuthor && <AuthorCard id={openAuthor} onClose={() => setOpenAuthor(null)} />}
      </AnimatePresence>
    </div>
  );
}