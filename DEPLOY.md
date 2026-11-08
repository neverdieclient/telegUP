# telegUP — как выложить в интернет (полностью бесплатно)

Стек: Vite + React → **Cloudflare Pages** (хостинг) → **Supabase** (регистрация, профили
и общий топ). Оба сервиса бесплатные, карта не нужна.

---

## 1. Supabase — регистрация и общий топ

1. Зарегистрируйся на [supabase.com](https://supabase.com) → **New project**.
2. Открой **SQL Editor** → **New query**, вставь весь файл `supabase/schema.sql` и нажми **Run**.
3. **Authentication → Providers → Email**: включён по умолчанию.
   * Если не хочешь подтверждения по почте: **Authentication → Sign In / Providers → Email** →
     выключи **Confirm email**. Тогда после регистрации вход происходит сразу.
4. **Project Settings → API** — скопируй `Project URL` и `anon public` ключ.

Создай в корне проекта файл `.env.local`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`anon` ключ безопасен: на таблице включён RLS, читать может любой,
писать — только свою строку.

### Экаунт владельца

1. `npm run dev`, открой `/auth`, создай аккаунт с почтой владельца на любую
   удобную тебе username (ник в админке роли не играет).
2. В Supabase → SQL Editor выполни один раз:

```sql
update public.profiles
   set marks = array['owner','premium','basic','crown']
 where id = (select id from auth.users
              where lower(email) = lower('ПОЧТА_ВЛАДЕЛЬЦА'));
```

3. Зайди на `/admin` под этим аккаунтом — панель откроется.
   Остальным аккаунтам `/admin` всегда показывает «Доступ закрыт».

Почта владельца прописана в `src/pages/Admin.tsx` (константа `OWNER_EMAIL`)
и в `supabase/schema.sql` (функция `grant_mark`). Меняешь владельца — поменяй
почту в обоих файлах и заново выполни SQL из `schema.sql`.

Пароль в коде не хранится нигде: его проверяет Supabase на сервере, в браузер
уходит только хеш сессии. Поэтому пароль от аккаунта не виден в исходниках.

### Как выдавать подарки

`/admin` → «Игроки и знаки» → вбей ник → у игрока откроется карточка → кнопки
**Овнер / Premium / Проверенный / Коллекционный** ставят метку прямо в базе
(функция `grant_mark`, работает только с аккаунта владельца с меткой `owner`).
«Мой профиль» — такие же кнопки для себя.

---

## 2. GitHub — приватный репозиторий

```bash
git init
git add .
git commit -m "telegUP"
```

Создай репозиторий на github.com → **Private**. Затем:

```bash
git remote add origin https://github.com/ТВОЙ_ЛОГИН/telegup.git
git push -u origin main
```

`.env.local`, `node_modules` и `dist` уже в `.gitignore` и в репозиторий не попадут.

---

## 3. Cloudflare Pages — публичный сайт

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
2. Дай доступ к своему приватному репозиторию `telegup`.
3. Настройки сборки:

| Параметр | Значение |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `20` (или новее) |

4. **Environment variables** → добавь:
   - `VITE_SUPABASE_URL` — из Supabase
   - `VITE_SUPABASE_ANON_KEY` — из Supabase
5. **Save and Deploy**. Через ~1 минуту сайт будет доступен на
   `https://telegup.pages.dev` (адрес можно переименовать в настройках проекта).

Исходники остаются в приватном репозитории, публикуется только собранная
статическая папка `dist`. Люди заходят на `telegup.pages.dev`, регистрируются
и попадают в общий топ.

Каждый `git push` в `main` автоматически пересобирает и обновляет сайт.

---

## 4. Локальная проверка сборки

```bash
npm install
npm run build
npm run preview
```

## Если Supabase не подключён

Приложение всё равно запускается — играет в локальном режиме, сохранение в
LocalStorage браузера. На странице топа будет предупреждение, что онлайн-реестр
не подключён.

---

> Это игра. Все подарки вымышлены, реальный вывод средств невозможен.
