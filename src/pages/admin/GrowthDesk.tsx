import { useState } from "react";
import { useGame } from "../../store/useGame";
import { createPromo, deletePromo, listPromos, type PromoKind } from "../../lib/promos";
import { clearAdminLog, listAdminLog } from "../../lib/adminTools";
import { Button } from "../../components/ui/Button";

/**
 * Promo codes, the global discount and the audit log — the three small levers
 * that make the site feel alive without a new page.
 */

/* --------------------------------------------------------------- promos */

const KIND_LABEL: Record<PromoKind, string> = {
  stars: "звёзды",
  ton: "TON",
  premium: "дни Premium",
};

export function PromoDesk() {
  const toast = useGame((s) => s.toast);
  const [promos, setPromos] = useState(listPromos);
  const [kind, setKind] = useState<PromoKind>("stars");
  const [amount, setAmount] = useState("500");
  const [uses, setUses] = useState("1");
  const [note, setNote] = useState("");

  const make = () => {
    const promo = createPromo({
      kind,
      amount: Number(amount) || 1,
      uses: Number(uses) || 1,
      note: note.trim() || undefined,
    });
    setPromos(listPromos());
    setNote("");
    void navigator.clipboard?.writeText(promo.code).catch(() => undefined);
    toast({ kind: "success", title: promo.code, message: "Код скопирован в буфер обмена" });
  };

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">что даёт</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PromoKind)}
            className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-2 text-[12px] outline-none"
          >
            {(Object.keys(KIND_LABEL) as PromoKind[]).map((k) => (
              <option key={k} value={k} className="bg-[#0d0d10]">
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">сколько</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-2.5 text-[12px] tabular-nums outline-none focus:border-neon/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">активаций</span>
          <input
            inputMode="numeric"
            value={uses}
            onChange={(e) => setUses(e.target.value.replace(/\D/g, ""))}
            className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-2.5 text-[12px] tabular-nums outline-none focus:border-neon/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">кому</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="канал, розыгрыш…"
            className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-2.5 text-[12px] outline-none placeholder:text-white/15 focus:border-neon/40"
          />
        </label>
      </div>

      <Button full size="sm" onClick={make}>
        Создать код
      </Button>

      {promos.length > 0 ? (
        <div className="divide-y divide-white/[0.06]">
          {promos.slice(0, 8).map((p) => (
            <div key={p.code} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11.5px] font-bold tracking-tight">{p.code}</p>
                <p className="text-[9.5px] text-white/25">
                  {KIND_LABEL[p.kind]} · {p.amount} · осталось {p.usesLeft}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(p.code).catch(() => undefined);
                  toast({ kind: "info", title: "Скопировано", message: p.code });
                }}
                className="shrink-0 rounded-md border border-white/12 px-1.5 py-0.5 text-[9.5px] font-bold text-white/50 hover:text-white"
              >
                копировать
              </button>
              <button
                onClick={() => {
                  deletePromo(p.code);
                  setPromos(listPromos());
                }}
                className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[9.5px] font-bold text-white/30 hover:text-mythic"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-white/7 bg-white/[0.02] px-3 py-3 text-center text-[10.5px] text-white/25">
          Кодов пока нет
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-white/22">
        Код активируется в профиле игрока и срабатывает один раз на аккаунт. Отдавай его в
        канале — код не привязан к конкретному человеку.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- discount */

export function DiscountDesk() {
  const discount = useGame((s) => s.admin.discount);
  const setAdmin = useGame((s) => s.setAdmin);
  const steps = [0, 5, 10, 15, 20, 30, 50];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {steps.map((d) => (
          <button
            key={d}
            onClick={() => setAdmin({ discount: d })}
            className={`rounded-xl border px-2.5 py-1.5 text-[11.5px] font-bold tabular-nums transition ${
              discount === d
                ? "border-neon/45 bg-neon/15 text-neon"
                : "border-white/8 bg-black/30 text-white/45 hover:text-white/80"
            }`}
          >
            {d === 0 ? "выкл" : `−${d}%`}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-white/30">
        {discount === 0
          ? "Скидки нет — цены как в прайсе."
          : `Все цены магазина снижены на ${discount}%. Кнопка «выкл» возвращает прайс.`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- audit log */

export function AuditDesk() {
  const [rows, setRows] = useState(listAdminLog);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-white/7 bg-white/[0.02] px-3 py-4 text-center text-[10.5px] text-white/25">
        Журнал пуст — здесь появятся все действия консоли
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {rows.slice(0, 60).map((r, i) => (
          <div key={`${r.at}-${i}`} className="flex items-start gap-2 rounded-lg border border-white/6 bg-black/20 px-2 py-1.5">
            <span className="shrink-0 text-[9.5px] tabular-nums text-white/25">
              {new Date(r.at).toLocaleString("ru-RU", {
                day: "numeric",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="shrink-0 text-[10px] font-bold text-white/60">{r.action}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-white/30">
              {r.detail}
              {r.target ? ` · @${r.target}` : ""}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          clearAdminLog();
          setRows([]);
        }}
        className="w-full rounded-lg border border-white/8 px-2 py-1.5 text-[10px] font-bold text-white/35 hover:text-white/70"
      >
        Очистить журнал
      </button>
    </div>
  );
}