import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The official news channel.
 *
 * Only the owner account can publish (enforced by RLS in `news.sql`); everyone
 * else just reads. The feed is cached in a module store so every component that
 * shows it (the channel page, the dashboard teaser) stays in sync.
 */

export type NewsKind = "post" | "update" | "fix" | "event";

export type NewsPost = {
  id: number;
  author_id: string | null;
  kind: NewsKind;
  title: string | null;
  body: string;
  media_url: string | null;
  media_kind: "image" | "video" | null;
  pinned: boolean;
  created_at: string;
};

export type NewsDraft = {
  kind: NewsKind;
  title: string;
  body: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  pinned: boolean;
};

/* ------------------------------------------------------------------ store */

let posts: NewsPost[] = [];
let loaded = false;
let loadError: string | null = null;
let inFlight: Promise<void> | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function subscribeNews(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getNewsPosts = () => posts;
export const newsLoaded = () => loaded;
export const newsError = () => loadError;

/** Newest first, pinned on top. */
function sortPosts(list: NewsPost[]): NewsPost[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function loadNews(force = false): Promise<void> {
  if (!supabase) {
    loaded = true;
    emit();
    return;
  }
  if (inFlight) return inFlight;
  if (loaded && !force) return;

  inFlight = (async () => {
    const { data, error } = await supabase
      .from("news_posts")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      loadError = error.message;
    } else {
      posts = sortPosts((data ?? []) as NewsPost[]);
      loadError = null;
    }
    loaded = true;
    emit();
    inFlight = null;
  })();

  return inFlight;
}

/** Live updates: append/refresh when the owner publishes something. */
export function initNewsRealtime(): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel("news-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "news_posts" }, () => {
      void loadNews(true);
    })
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

/* ----------------------------------------------------------------- writes */

export async function publishNews(draft: NewsDraft): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const body = draft.body.trim();
  if (!body) return { error: "Текст не может быть пустым" };
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("news_posts").insert({
    author_id: userData?.user?.id ?? null,
    kind: draft.kind,
    title: draft.title.trim() || null,
    body,
    media_url: draft.mediaUrl || null,
    media_kind: draft.mediaKind,
    pinned: draft.pinned,
  });
  if (error) return { error: error.message };
  await loadNews(true);
  return {};
}

export async function deleteNews(id: number): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const { error } = await supabase.from("news_posts").delete().eq("id", id);
  if (error) return { error: error.message };
  await loadNews(true);
  return {};
}

export async function setNewsPinned(id: number, pinned: boolean): Promise<{ error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const { error } = await supabase.from("news_posts").update({ pinned }).eq("id", id);
  if (error) return { error: error.message };
  await loadNews(true);
  return {};
}

/** Upload a cover image or a trailer video and return its public URL. */
export async function uploadNewsMedia(
  file: File,
): Promise<{ url?: string; kind?: "image" | "video"; error?: string }> {
  if (!supabase) return { error: "Онлайн-база не подключена" };
  const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
  const ext = (file.name.split(".").pop() || (kind === "video" ? "mp4" : "webp")).toLowerCase();
  const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("news-media").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("news-media").getPublicUrl(path);
  return { url: data.publicUrl, kind };
}

/* ------------------------------------------------------------------- hooks */

/** Reactive feed for a component. */
export function useNewsFeed(): {
  posts: NewsPost[];
  loaded: boolean;
  error: string | null;
} {
  const [, force] = useState(0);

  useEffect(() => {
    const off = subscribeNews(() => force((n) => n + 1));
    void loadNews();
    return off;
  }, []);

  return { posts, loaded, error: loadError };
}