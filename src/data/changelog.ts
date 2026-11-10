/**
 * What landed in the app — shown on the «Обновления» screen and used to build
 * the animated update slideshow. Owner-only / admin work is deliberately not
 * listed: players should never see that an admin console exists.
 *
 * Newest release on top. Bump `version` when you ship a batch.
 */

export type ChangelogTag = "new" | "fix" | "balance" | "design";

export type ChangelogEntry = {
  text: string;
  tag: ChangelogTag;
};

export type ChangelogRelease = {
  version: string;
  /** ISO date, shown as-is. */
  date: string;
  title: string;
  summary: string;
  entries: ChangelogEntry[];
};

export const TAG_META: Record<ChangelogTag, { label: string; color: string }> = {
  new: { label: "новое", color: "#a3ff12" },
  fix: { label: "фикс", color: "#3b9dff" },
  balance: { label: "баланс", color: "#ff8f3d" },
  design: { label: "дизайн", color: "#b45cff" },
};

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "1.4",
    date: "2026-11-10",
    title: "Канал новостей и подарки друзьям",
    summary: "Теперь у проекта есть официальный канал, а подарки реально доходят друзьям.",
    entries: [
      { text: "Официальный канал: апдейты, фиксы и трейлеры в одном месте", tag: "new" },
      { text: "Подарки другим игрокам теперь доставляются в инвентарь получателя", tag: "fix" },
      { text: "Инвентарь сохраняется на аккаунт и больше не пропадает после перезагрузки", tag: "fix" },
      { text: "Улучшенные модели открываются кликом по подарку в маркете", tag: "design" },
      { text: "Telegram Premium переехал в маркет", tag: "new" },
      { text: "Кейс автоматически прокручивается к рулетке при открытии", tag: "design" },
    ],
  },
  {
    version: "1.3",
    date: "2026-11-08",
    title: "Модели и аукцион",
    summary: "Все модели подарков стали различимыми, аукцион получил честный таймер.",
    entries: [
      { text: "Все модели подарков получили своё изображение и анимацию", tag: "design" },
      { text: "Аукцион: после ставки ждём 30 минут, и если никто не перебил — предмет ваш", tag: "new" },
      { text: "Инвентарь других игроков можно открыть из топа и профиля", tag: "new" },
      { text: "Переключатель приватности инвентаря в настройках профиля", tag: "new" },
    ],
  },
  {
    version: "1.2",
    date: "2026-11-05",
    title: "Маркет и цены",
    summary: "Маркет стал удобнее, цены — предсказуемее.",
    entries: [
      { text: "Фильтры по редкости и коллекции в маркете", tag: "new" },
      { text: "Разброс цен моделей пересчитан по реальной редкости", tag: "balance" },
      { text: "Скролл ленты кейсов больше не дёргается", tag: "fix" },
    ],
  },
];