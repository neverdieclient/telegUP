import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckMark } from "../components/ui/CheckMark";
import { Button } from "../components/ui/Button";
import { StarIcon } from "../components/gifts/GiftArt";
import { useIsOwnerEmail } from "../lib/useIsOwnerEmail";
import {
  deleteNews,
  initNewsRealtime,
  newsError,
  publishNews,
  setNewsPinned,
  subscribeNews,
  uploadNewsMedia,
  useNewsFeed,
  type NewsKind,
  type NewsPost,
} from "../lib/news";

/**
 * The official telegUP channel.
 *
 * Read-only for players; the owner gets a composer at the top (only rendered
 * for the owner account, and the database refuses writes from anyone else
 * regardless). Styled like a Telegram channel: a header with the channel name,
 * the MAJOR verification mark and the post feed.
 */

const KIND_META: Record<NewsKind, { label: string; color: string }> = {
  post: { label: "Пост", color: "#8b5cf6" },
  update: { label: "Обновление", color: "#a3ff12" },
  fix: { label: "Фикс", color: "#3b9dff" },
  event: { label: "Ивент", color: "#ff8f3d" },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `сегодня, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `вчера, ${time}`;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}, ${time}`;
}

/* ------------------------------------------------------------------ post */

function NewsCard({
  post,
  isOwner,
  onDelete,
  onPin,
}: {
  post: NewsPost;
  isOwner: boolean;
  onDelete: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
}) {
  const meta = KIND_META[post.kind] ?? KIND_META.post;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="relative overflow-hidden rounded-3xl border border-white/8 bg-white/[0.025] p-4 backdrop-blur-xl"
    >
      {post.pinned && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/60 to-transparent" />
      )}

      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl text-[13px] font-black"
            style={{ background: `${meta.color}22`, color: meta.color }}
          >
            {post.kind === "fix" ? "✓" : post.kind === "update" ? "↑" : "★"}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-[13px] font-extrabold tracking-tight">
              telegUP
              <CheckMark kind="major" size={13} />
              {post.pinned && (
                <span className="ml-1 rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] font-bold text-white/50">
                  закреп
                </span>
              )}
            </p>
            <p className="text-[10.5px] text-white/30">
              <span style={{ color: meta.color }} className="font-bold">
                {meta.label}
              </span>{" "}
              · {fmtDate(post.created_at)}
            </p>
          </div>
        </div>

        {isOwner && (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => onPin(post.id, !post.pinned)}
              title={post.pinned ? "Открепить" : "Закрепить"}
              className="rounded-lg border border-white/8 px-2 py-1 text-[10px] font-bold text-white/40 hover:text-white"
            >
              {post.pinned ? "📌" : "📍"}
            </button>
            <button
              onClick={() => onDelete(post.id)}
              title="Удалить"
              className="rounded-lg border border-mythic/20 px-2 py-1 text-[10px] font-bold text-mythic/70 hover:text-mythic"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {post.title && (
        <h3 className="mt-3 text-[15.5px] font-extrabold leading-snug tracking-tight">{post.title}</h3>
      )}

      <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/70">
        {post.body}
      </p>

      {post.media_url && post.media_kind === "image" && (
        <motion.img
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          src={post.media_url}
          alt=""
          loading="lazy"
          className="mt-3 w-full rounded-2xl border border-white/8 object-cover"
        />
      )}

      {post.media_url && post.media_kind === "video" && (
        <video
          src={post.media_url}
          controls
          playsInline
          preload="metadata"
          className="mt-3 w-full rounded-2xl border border-white/8 bg-black"
        />
      )}
    </motion.article>
  );
}

/* -------------------------------------------------------------- composer */

function Composer() {
  const [kind, setKind] = useState<NewsKind>("post");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await uploadNewsMedia(file);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMediaUrl(res.url ?? null);
    setMediaKind(res.kind ?? "image");
  };

  const publish = async () => {
    if (!body.trim()) {
      setError("Напиши текст поста");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await publishNews({ kind, title, body, mediaUrl, mediaKind, pinned: false });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setTitle("");
    setBody("");
    setMediaUrl(null);
    setMediaKind(null);
    setKind("post");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-dashed border-neon/25 bg-neon/[0.04] px-4 py-3 text-left transition-colors hover:border-neon/45 hover:bg-neon/[0.07]"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-neon/15 text-neon">＋</span>
        <span className="text-[12.5px] font-bold text-neon/90">Опубликовать в канал</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-white/25">
          только владелец
        </span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 space-y-2.5 rounded-3xl border border-neon/25 bg-neon/[0.04] p-4"
    >
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(KIND_META) as NewsKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-colors ${
              kind === k
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/8 text-white/40 hover:text-white/70"
            }`}
          >
            {KIND_META[k].label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Заголовок (необязательно)"
        className="w-full rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-[13px] font-bold text-white outline-none placeholder:text-white/25 focus:border-neon/40"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Что нового? Текст поста…"
        rows={5}
        className="w-full resize-y rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-neon/40"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          🖼 Фото / 🎬 Видео
        </Button>
        {mediaUrl && (
          <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-[10.5px] font-bold text-white/60">
            {mediaKind === "video" ? "видео" : "фото"} прикреплено
            <button
              onClick={() => {
                setMediaUrl(null);
                setMediaKind(null);
              }}
              className="text-mythic/70 hover:text-mythic"
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {mediaUrl && mediaKind === "image" && (
        <img src={mediaUrl} alt="" className="max-h-48 rounded-xl border border-white/8 object-cover" />
      )}

      {error && <p className="text-[11.5px] font-bold text-mythic">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => void publish()} disabled={busy}>
          {busy ? "…" : "Опубликовать"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Отмена
        </Button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------- page */

export default function News() {
  const isOwner = useIsOwnerEmail();
  const { posts, loaded } = useNewsFeed();
  const [, force] = useState(0);

  useEffect(() => {
    const offSub = subscribeNews(() => force((n) => n + 1));
    const offRt = initNewsRealtime();
    return () => {
      offSub();
      offRt();
    };
  }, []);

  const error = newsError();
  const isEmpty = useMemo(() => loaded && posts.length === 0, [loaded, posts.length]);

  const onDelete = (id: number) => {
    if (!window.confirm("Удалить этот пост?")) return;
    void deleteNews(id);
  };
  const onPin = (id: number, pinned: boolean) => void setNewsPinned(id, pinned);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* channel header */}
      <header className="relative overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-violet/[0.16] via-white/[0.03] to-transparent p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-violet/20 blur-[70px]" />
        <div className="relative flex items-center gap-3.5">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-neon to-[#7bd400] text-[22px] font-black text-black shadow-[0_16px_40px_-18px_rgba(163,255,18,0.9)]">
            ★
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[17px] font-black tracking-tight">
              telegUP
              <CheckMark kind="major" size={16} />
            </p>
            <p className="text-[11.5px] text-white/35">Официальный канал · обновления и фиксы</p>
          </div>
        </div>
        <p className="relative mt-3 rounded-2xl border border-white/6 bg-black/25 px-3 py-2 text-[11.5px] leading-relaxed text-white/45">
          Здесь публикуем апдейты, фиксы и новости проекта. Писать может только владелец —
          остальные читают.
        </p>
        <div className="relative mt-3 flex items-center gap-3 text-[10.5px] font-bold text-white/30">
          <span>{posts.length} постов</span>
          <span className="inline-flex items-center gap-1">
            <StarIcon className="size-3 text-neon" /> telegUP
          </span>
          <Link
            to="/app/updates"
            className="ml-auto rounded-lg border border-white/10 px-2 py-1 text-[10.5px] font-bold text-white/50 hover:border-white/25 hover:text-white"
          >
            Список апдейтов →
          </Link>
        </div>
      </header>

      {isOwner && <Composer />}

      {!loaded && (
        <div className="grid place-items-center py-12">
          <span className="size-7 animate-spin rounded-full border-2 border-white/10 border-t-neon" />
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-mythic/20 bg-mythic/[0.06] px-3 py-2 text-[11.5px] font-bold text-mythic/80">
          Не удалось загрузить канал: {error}
          <br />
          Похоже, не выполнен `supabase/news.sql`.
        </p>
      )}

      {isEmpty && !error && (
        <div className="rounded-3xl border border-dashed border-white/10 py-12 text-center">
          <p className="text-[13px] font-bold text-white/45">Пока нет постов</p>
          <p className="mt-1 text-[11.5px] text-white/25">
            {isOwner ? "Напишите первый пост кнопкой выше" : "Скоро здесь появятся новости"}
          </p>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {posts.map((post) => (
          <NewsCard
            key={post.id}
            post={post}
            isOwner={isOwner}
            onDelete={onDelete}
            onPin={onPin}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}