import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteCustomGift,
  isImageFile,
  modelNameFromFile,
  saveCustomGift,
  slugFor,
  uploadCustomImage,
  uploadCustomImages,
} from "../../data/customGifts";
import type { CustomGiftDraft, CustomModel, CustomVisibility } from "../../data/customGifts";
import { useCustomGiftRows, useCustomGiftStatus } from "../../lib/useCatalog";
import { useIsOwnerEmail } from "../../lib/useIsOwnerEmail";
import { useAuth } from "../../lib/players";
import { useGame } from "../../store/useGame";
import { GiftArt } from "../../components/gifts/GiftArt";
import { Button } from "../../components/ui/Button";

const EMPTY: CustomGiftDraft = {
  slug: "",
  name: "",
  visibility: "public",
  price: 1000,
  image: null,
  accent: "#a3ff12",
  description: "",
  models: [],
};

const label = "text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35";
const field =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/20 focus:border-neon/40";

/**
 * Temporary diagnostic: a "test gift is not in the market" report is almost
 * always one of two things — the app does not see the owner's email, or the
 * row was saved as `public`/`test` the other way round. This prints both facts
 * so the admin panel answers the question without opening devtools.
 */
function OwnerDiagnostics() {
  const isOwner = useIsOwnerEmail();
  const { user } = useAuth();
  const email = (user?.email ?? "").trim();

  const customRows = useCustomGiftRows();
  const testCount = customRows.filter((r) => r.visibility === "test").length;
  const publicCount = customRows.length - testCount;

  return (
    <div className="space-y-1 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[10.5px] text-white/40">
      <p>
        Аккаунт: <span className="font-bold text-white/70">{email || "—"}</span>{" "}
        <span className={isOwner ? "text-neon" : "text-mythic"}>
          {isOwner ? "(владелец)" : "(не владелец)"}
        </span>
      </p>
      <p>
        В базе: {publicCount} «всем» · {testCount} «тест». Тестовые видит только владелец — если тут
        «не владелец», они скрыты.
      </p>
    </div>
  );
}

/** Image input: paste a link or upload a file from disk. */
function ImageField({
  value,
  onChange,
  hint,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    const res = await uploadCustomImage(file);
    setBusy(false);
    if (res.error) setErr(res.error);
    else if (res.url) onChange(res.url);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.trim() || null)}
          placeholder="https://… или загрузи файл"
          className={field}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 rounded-xl border border-white/10 bg-white/6 px-2.5 text-[11px] font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
        >
          {busy ? "…" : "Файл"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      {hint && !err && <p className="text-[10px] text-white/25">{hint}</p>}
      {err && <p className="text-[10px] font-bold text-mythic">{err}</p>}
    </div>
  );
}

/**
 * Folder import: pick a whole folder (or many files at once) and turn every
 * picture into an upgrade model — the name comes from the file name, so a
 * folder of «Gold Adesanya.webp», «UFC World.webp»… is added in one go.
 */
function BulkModelImport({
  defaults,
  onAdd,
  onBusy,
}: {
  defaults: { price: number; rarityPct: number };
  onAdd: (models: CustomModel[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const dirRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<HTMLInputElement | null>(null);
  const [price, setPrice] = useState(defaults.price);
  const [rarityPct, setRarityPct] = useState(defaults.rarityPct);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const busy = progress !== null;

  const handle = async (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => isImageFile(f.name, f.type));
    if (!picked.length) {
      setErrors(["В выбранной папке нет картинок (webp / png / jpg)"]);
      return;
    }
    setErrors([]);
    setProgress({ done: 0, total: picked.length });
    onBusy(true);
    const res = await uploadCustomImages(picked, (done, total) => setProgress({ done, total }));
    onBusy(false);
    setProgress(null);
    setErrors(res.errors);
    if (res.results.length) {
      onAdd(
        res.results.map((r) => ({
          name: modelNameFromFile(r.fileName),
          price: Math.max(1, Math.round(price)),
          rarityPct,
          image: r.url,
        })),
      );
    }
  };

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="space-y-2 rounded-xl border border-neon/25 bg-neon/[0.04] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-neon/80">
          Папка с улучшениями
        </p>
        <span className="text-[10px] text-white/30">все картинки за раз</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-1">
          <span className="block text-[10px] text-white/40">Цена ★ для всех</span>
          <input
            type="number"
            min={1}
            value={price}
            disabled={busy}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
            className={field}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] text-white/40">Редкость % для всех</span>
          <input
            type="number"
            min={0.1}
            max={100}
            step={0.1}
            value={rarityPct}
            disabled={busy}
            onChange={(e) => setRarityPct(Number(e.target.value) || 0)}
            className={field}
          />
        </label>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => dirRef.current?.click()}
          className="flex-1 rounded-xl border border-neon/35 bg-neon/12 px-2 py-2 text-[11.5px] font-extrabold text-neon hover:bg-neon/20 disabled:opacity-40"
        >
          Выбрать папку
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => filesRef.current?.click()}
          className="flex-1 rounded-xl border border-white/10 bg-white/6 px-2 py-2 text-[11.5px] font-bold text-white/75 hover:bg-white/10 disabled:opacity-40"
        >
          Выбрать файлы
        </button>
      </div>

      {/* `webkitdirectory` lets the owner pick a whole folder in one click */}
      <input
        ref={dirRef}
        type="file"
        multiple
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ webkitdirectory: "", directory: "" } as any)}
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={filesRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />

      {progress && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-neon transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-white/40">
            Загружаю {progress.done} из {progress.total}…
          </p>
        </div>
      )}

      {!!errors.length && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-bold text-mythic">Не загрузилось: {errors.length}</p>
          {errors.slice(0, 4).map((e) => (
            <p key={e} className="truncate text-[10px] text-mythic/70">
              {e}
            </p>
          ))}
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-white/25">
        Название берётся из имени файла («Gold Adesanya.webp» → «Gold Adesanya»), картинка
        загружается в облако. Цену и редкость потом можно поправить у каждой модели.
      </p>
    </div>
  );
}

/**
 * Owner panel for minting gifts and their upgrade models.
 *
 * - «Всем» gifts appear in the market for every player.
 * - «Тест» gifts are visible, but only the owner account can buy them.
 *
 * Rows live in the shared `custom_gifts` table, so the catalogue is the same
 * on every device.
 */
export function CustomGiftEditor() {
  const rows = useCustomGiftRows();
  const { loaded, error: loadErr } = useCustomGiftStatus();
  const toast = useGame((s) => s.toast);

  const [draft, setDraft] = useState<CustomGiftDraft>(EMPTY);
  /** which saved row is being edited (null = creating a new one) */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  // the slug follows the name until the owner edits it by hand
  useEffect(() => {
    if (!slugTouched && draft.name) setDraft((d) => ({ ...d, slug: slugFor(draft.name) }));
  }, [draft.name, slugTouched]);

  const patch = (p: Partial<CustomGiftDraft>) => setDraft((d) => ({ ...d, ...p }));

  const patchModel = (i: number, p: Partial<CustomModel>) =>
    setDraft((d) => ({ ...d, models: d.models.map((m, k) => (k === i ? { ...m, ...p } : m)) }));

  const addModel = () =>
    setDraft((d) => ({
      ...d,
      models: [...d.models, { name: "", price: Math.max(d.price * 2, 100), rarityPct: 10, image: null }],
    }));

  const removeModel = (i: number) =>
    setDraft((d) => ({ ...d, models: d.models.filter((_, k) => k !== i) }));

  const addModels = (models: CustomModel[]) => setDraft((d) => ({ ...d, models: [...d.models, ...models] }));

  const startCreate = () => {
    setEditingId(null);
    setDraft(EMPTY);
    setSlugTouched(false);
  };

  const startEdit = (id: number) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setEditingId(id);
    setSlugTouched(true);
    setDraft({
      slug: row.slug,
      name: row.name,
      visibility: row.visibility,
      price: row.price,
      image: row.image,
      accent: row.accent,
      description: row.description,
      models: Array.isArray(row.models) ? row.models : [],
    });
  };

  const valid = draft.name.trim().length > 1 && /^[a-z0-9-]+$/i.test(draft.slug);

  const save = async () => {
    if (!valid) {
      toast({ kind: "error", title: "Проверь поля", message: "Нужно название и slug из латиницы/цифр/дефисов" });
      return;
    }
    setBusy(true);
    const res = await saveCustomGift(
      { ...draft, models: draft.models.filter((m) => m.name.trim()) },
      editingId ?? undefined,
    );
    setBusy(false);
    if (res.error) {
      toast({ kind: "error", title: "Не сохранилось", message: res.error });
      return;
    }
    toast({
      kind: "success",
      title: editingId ? "Подарок обновлён" : "Подарок создан",
      message: draft.visibility === "test" ? "Тестовый — купить можешь только ты" : "Доступен всем игрокам",
    });
    startCreate();
  };

  const remove = async (id: number) => {
    const res = await deleteCustomGift(id);
    if (res.error) toast({ kind: "error", title: "Ошибка", message: res.error });
    else {
      toast({ kind: "success", title: "Удалено" });
      if (editingId === id) startCreate();
    }
    setConfirmDelete(null);
  };

  const preview = useMemo(
    () => [
      {
        id: "preview-gift",
        name: draft.name || "Новый подарок",
        slug: draft.slug || "preview",
        variant: "Gift",
        kind: "gift" as const,
        image: draft.image,
        gradient: null,
        tint: draft.accent,
        rarity: "mythic" as const,
        rarityPct: 100,
        ton: 0,
        stars: draft.price,
        realStars: 0,
        supply: 0,
        weight: 1,
        desc: "",
      },
    ],
    [draft],
  );

  return (
    <div className="space-y-3">
      {loadErr && (
        <p className="rounded-xl border border-mythic/30 bg-mythic/10 px-3 py-2 text-[11px] font-bold text-mythic">
          Не удалось загрузить общие подарки: {loadErr}. Запусти `supabase/custom-gifts.sql`.
        </p>
      )}

      {/* temporary: shows what identity the app actually sees, so a "test
          gift is missing from the market" report can be diagnosed at a glance */}
      <OwnerDiagnostics />

      {/* ---------------- existing ---------------- */}
      <div className="space-y-1.5">
        <p className={label}>Мои подарки ({rows.length})</p>
        {!loaded && <p className="text-[11px] text-white/25">Загрузка…</p>}
        {loaded && !rows.length && (
          <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-3 text-[11px] text-white/25">
            Пока пусто — создай первый подарок ниже.
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${
              editingId === r.id ? "border-neon/40 bg-neon/[0.06]" : "border-white/8 bg-black/25"
            }`}
          >
            <span className="grid size-9 shrink-0 place-items-center">
              {r.image ? (
                <img src={r.image} alt="" className="size-8 object-contain" />
              ) : (
                <span className="grid size-8 place-items-center rounded-md" style={{ background: `${r.accent}22`, color: r.accent }}>
                  {r.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-extrabold">{r.name}</span>
              <span className="block text-[10px] text-white/35">
                {r.visibility === "test" ? "тестовый · только владелец" : "всем"} · {r.price.toLocaleString("ru-RU")}★ ·{" "}
                {(r.models ?? []).length} моделей
              </span>
            </span>
            <button
              onClick={() => startEdit(r.id)}
              className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] font-bold text-white/70 hover:bg-white/10"
            >
              Изменить
            </button>
            {confirmDelete === r.id ? (
              <button
                onClick={() => void remove(r.id)}
                className="shrink-0 rounded-lg border border-mythic/40 bg-mythic/15 px-2 py-1 text-[10.5px] font-bold text-mythic"
              >
                Точно?
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(r.id)}
                className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10.5px] font-bold text-white/40 hover:text-mythic"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ---------------- form ---------------- */}
      <div className="space-y-2.5 rounded-2xl border border-white/8 bg-black/25 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className={label}>{editingId ? "Редактирование" : "Новый подарок"}</p>
          {editingId && (
            <button onClick={startCreate} className="text-[10.5px] font-bold text-white/40 hover:text-white/70">
              Отменить
            </button>
          )}
        </div>

        {/* name + slug */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[10.5px] text-white/40">Название</p>
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Мой подарок"
              className={field}
            />
          </div>
          <div>
            <p className="mb-1 text-[10.5px] text-white/40">Slug (латиница, цифры, дефис)</p>
            <input
              value={draft.slug}
              onChange={(e) => {
                setSlugTouched(true);
                patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
              }}
              placeholder="my-gift"
              className={field}
            />
          </div>
        </div>

        {/* price + visibility + accent */}
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-[10.5px] text-white/40">Цена, ★</p>
            <input
              type="number"
              min={1}
              value={draft.price}
              onChange={(e) => patch({ price: Math.max(0, Number(e.target.value) || 0) })}
              className={field}
            />
          </div>
          <div>
            <p className="mb-1 text-[10.5px] text-white/40">Кто может купить</p>
            <div className="flex gap-1.5">
              {(
                [
                  { id: "public" as CustomVisibility, text: "Всем" },
                  { id: "test" as CustomVisibility, text: "Тест" },
                ] satisfies { id: CustomVisibility; text: string }[]
              ).map((v) => (
                <button
                  key={v.id}
                  onClick={() => patch({ visibility: v.id })}
                  className={`flex-1 rounded-xl border px-2 py-2 text-[11.5px] font-bold transition ${
                    draft.visibility === v.id
                      ? "border-neon/45 bg-neon/12 text-neon"
                      : "border-white/10 bg-black/30 text-white/45 hover:bg-white/5"
                  }`}
                >
                  {v.text}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10.5px] text-white/40">Акцент</p>
            <input
              type="color"
              value={draft.accent}
              onChange={(e) => patch({ accent: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-xl border border-white/10 bg-black/40"
            />
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-white/30">
          «Всем» — обычный публичный подарок. «Тест» — виден всем, но купить его можешь только ты.
        </p>

        {/* picture */}
        <div>
          <p className="mb-1 text-[10.5px] text-white/40">Картинка подарка</p>
          <ImageField value={draft.image} onChange={(url) => patch({ image: url })} hint="Ссылка или файл с компьютера" />
        </div>

        {/* description */}
        <div>
          <p className="mb-1 text-[10.5px] text-white/40">Описание</p>
          <textarea
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            placeholder="Необязательно"
            className={field}
          />
        </div>

        {/* models */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className={label}>Улучшения ({draft.models.length})</p>
            <button onClick={addModel} className="text-[10.5px] font-bold text-neon/80 hover:text-neon">
              + Добавить модель
            </button>
          </div>

          <BulkModelImport
            defaults={{
              price: Math.max(draft.price * 2, 100),
              rarityPct: 10,
            }}
            onAdd={addModels}
            onBusy={setImporting}
          />

          {!draft.models.length && (
            <p className="text-[10.5px] text-white/25">Пока без улучшений — подарок будет без моделей.</p>
          )}
          {draft.models.map((m, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border border-white/8 bg-black/30 p-2">
              <div className="flex gap-1.5">
                <input
                  value={m.name}
                  onChange={(e) => patchModel(i, { name: e.target.value })}
                  placeholder="Название модели"
                  className={field}
                />
                <button
                  onClick={() => removeModel(i)}
                  className="shrink-0 rounded-xl border border-white/10 px-2 text-[11px] font-bold text-white/40 hover:text-mythic"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={m.price}
                  onChange={(e) => patchModel(i, { price: Math.max(0, Number(e.target.value) || 0) })}
                  placeholder="Цена ★"
                  className={field}
                />
                <input
                  type="number"
                  min={0.1}
                  max={100}
                  step={0.1}
                  value={m.rarityPct}
                  onChange={(e) => patchModel(i, { rarityPct: Number(e.target.value) || 0 })}
                  placeholder="Редкость %"
                  className={field}
                />
              </div>
              <ImageField
                value={m.image ?? null}
                onChange={(url) => patchModel(i, { image: url })}
                hint="Без картинки возьмётся картинка самого подарка"
              />
            </div>
          ))}
          <p className="text-[10px] text-white/25">
            Редкость: ≤2% — мифик, ≤6% — легендарный, ≤15% — эпик, ≤40% — редкий, больше — обычный.
          </p>
        </div>

        {/* preview + save */}
        <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/30 p-2">
          <GiftArt gift={preview[0]} size={44} rounded="rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-extrabold">{draft.name || "Без названия"}</p>
            <p className="text-[10px] text-white/35">
              {draft.price.toLocaleString("ru-RU")}★ · {draft.visibility === "test" ? "только я" : "всем"}
            </p>
          </div>
          <Button size="sm" onClick={() => void save()} disabled={busy || importing || !valid}>
            {busy ? "…" : editingId ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </div>
    </div>
  );
}