/**
 * Supabase answers auth errors in English ("Email not confirmed").
 * The site is Russian, so map the handful of messages a player can
 * actually hit onto short, actionable text.
 */

const MAP: [RegExp, string][] = [
  [/email not confirmed/i, "Почта не подтверждена. Открой письмо от Supabase и нажми ссылку."],
  [/invalid login credentials/i, "Неверная почта или пароль."],
  [/user already registered|already been registered/i, "Эта почта уже зарегистрирована. Попробуй войти."],
  [/password should be at least \d+/i, "Пароль слишком короткий."],
  [/unable to validate email address|invalid email/i, "Проверь адрес почты."],
  [/email rate limit|rate limit exceeded|too many requests/i, "Слишком много попыток. Подожди минуту."],
  [/signups? not allowed/i, "Регистрация закрыта."],
  [/network|fetch failed|failed to fetch/i, "Нет связи с сервером. Проверь интернет."],
];

export function authError(message: string | null | undefined): string {
  if (!message) return "Не получилось. Попробуй ещё раз.";
  for (const [re, text] of MAP) if (re.test(message)) return text;
  return message;
}
