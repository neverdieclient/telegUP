import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn, signUp } from "../lib/players";
import { onlineEnabled } from "../lib/supabase";
import { localSignIn, localSignUp } from "../lib/localAuth";
import { Button } from "../components/ui/Button";
import { StarIcon } from "../components/gifts/GiftArt";
import { useGame } from "../store/useGame";
import { DISCLAIMER } from "../data/gifts";

type Mode = "login" | "register";

export default function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOkMsg(null);

    if (!onlineEnabled) {
      // offline mode: accounts live in this browser
      if (mode === "register") {
        const res = localSignUp(email, password, username);
        if (res.error) {
          setError(res.error);
        } else {
          // keep the same nickname the player registered with
          useGame.getState().setNickname(res.account!.username);
          setOkMsg("Аккаунт создан. Заходим…");
          window.setTimeout(() => nav("/app", { replace: true }), 250);
        }
      } else {
        const res = localSignIn(email, password);
        if (res.error) {
          setError(res.error);
        } else {
          useGame.getState().setNickname(res.account!.username);
          nav("/app", { replace: true });
        }
      }
      return;
    }
    if (mode === "register") {
      const clean = username.trim().replace(/^@/, "");
      if (!/^[A-Za-z0-9_]{3,20}$/.test(clean)) {
        setError("Юзернейм: 3–20 символов, буквы/цифры/_");
        return;
      }
    }
    if (password.length < 6) {
      setError("Пароль минимум 6 символов");
      return;
    }

    setBusy(true);
    try {
      if (mode === "register") {
        const res = await signUp(email.trim(), password, username.trim());
        if ("error" in res && res.error) {
          setError(res.error);
        } else {
          setOkMsg("Аккаунт создан. Проверь почту, если включено подтверждение, затем войди.");
          setMode("login");
        }
      } else {
        const res = await signIn(email.trim(), password);
        if ("error" in res && res.error) setError(res.error);
        else nav("/app");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grain relative grid min-h-dvh place-items-center overflow-hidden bg-ink px-4 py-10">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-neon/[0.08] blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-30%] right-[-10%] h-[420px] w-[520px] rounded-full bg-violet/[0.12] blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-2xl border border-neon/30 bg-neon/10">
            <svg viewBox="0 0 24 24" className="size-5 text-neon" fill="currentColor">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
            </svg>
          </span>
          <h1 className="brand-mark font-display text-4xl font-black tracking-tight">
            teleg<span className="brand-up">UP</span>
          </h1>
          <p className="mt-2 text-[12.5px] text-white/40">
            {mode === "register" ? "Создай аккаунт и играй онлайн" : "Войди в свой аккаунт"}
          </p>
        </div>

        <div className="rounded-3xl border border-white/8 bg-white/[0.035] p-5 backdrop-blur-2xl">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-black/30 p-1">
            {(
              [
                ["register", "Регистрация"],
                ["login", "Вход"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => {
                  setMode(k);
                  setError(null);
                  setOkMsg(null);
                }}
                className={`rounded-lg px-3 py-2 text-[12.5px] font-bold transition-colors ${
                  mode === k ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-2.5">
            {mode === "register" && (
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">юзернейм</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toUpperCase())}
                  placeholder="USERNAME"
                  maxLength={20}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] font-semibold text-white outline-none transition-colors placeholder:text-white/20 focus:border-neon/40"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mail.com"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] font-semibold text-white outline-none transition-colors placeholder:text-white/20 focus:border-neon/40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-[13px] font-semibold text-white outline-none transition-colors placeholder:text-white/20 focus:border-neon/40"
              />
            </label>

            {error && (
              <p className="rounded-xl border border-mythic/30 bg-mythic/10 px-3 py-2 text-[11.5px] font-semibold text-mythic">
                {error}
              </p>
            )}
            {okMsg && (
              <p className="rounded-xl border border-neon/30 bg-neon/10 px-3 py-2 text-[11.5px] font-semibold text-neon">
                {okMsg}
              </p>
            )}

            <Button full size="lg" disabled={busy} className="mt-1">
              {busy ? "Загрузка…" : mode === "register" ? "Создать аккаунт" : "Войти"}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/25">
            <StarIcon className="size-3 text-neon/60" />
            <span>500 ★ на старте · без реальных денег</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="max-w-[320px] text-center text-[10px] leading-relaxed text-white/20">
            Без регистрации войти нельзя. Аккаунт хранит прогресс и открывает онлайн-функции.
          </p>
          <p className="max-w-[320px] text-center text-[10px] leading-relaxed text-white/20">{DISCLAIMER}</p>
        </div>
      </motion.div>
    </div>
  );
}