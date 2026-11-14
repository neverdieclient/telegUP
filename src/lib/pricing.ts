/**
 * Prices after the owner's global discount.
 *
 * One place decides how a discount is applied, so the shop grid, the premium
 * page and the admin preview can never disagree about what a player pays.
 *
 * В 2.0 денег больше нет: цены живут в двух валютах — звёздах (целые, не ниже
 * 1 ★) и TON (две цифры после точки, не ниже 0.01). Правила намеренно скучные:
 * «−100%» превратило бы цену в 0 и выглядело бы как баг, а «99.5 ★» — как
 * опечатка.
 */

const clamp = (discount: number) => Math.min(95, Math.max(0, Math.round(discount || 0)));

/** Звёздная цена после скидки, целыми звёздами. */
export function discountPrice(stars: number, discount = 0): number {
  const d = clamp(discount);
  if (d === 0) return Math.max(0, Math.round(stars));
  return Math.max(1, Math.round((stars * (100 - d)) / 100));
}

/** TON after the discount, kept at two decimals like the price list. */
export function discountTon(ton: number, discount = 0): number {
  const d = clamp(discount);
  if (d === 0) return ton;
  return Math.max(0.01, Math.round(ton * (100 - d)) / 100);
}

/** True when the owner has a discount running, for the «−N%» badges. */
export const hasDiscount = (discount: number) => clamp(discount) > 0;

/**
 * Апгрейд модели: фиксированные 15★.
 *
 * Раньше цена считалась от разницы в стоимости выпавшей модели — и игрок
 * платил то 10★, то 40 000★ за один и тот же бросок. Теперь цена одна и та
 * же для любой коллекции: 15★ за попытку, как в Телеграме. Функции оставлены
 * с прежней сигнатурой, чтобы вызывающий код не пришлось переписывать.
 */
export const UPGRADE_STARS = 15;

/** @deprecated цена больше не зависит от разницы — см. `UPGRADE_STARS`. */
export const GUARANTEE_FEE = 1.1;
/** @deprecated цена больше не зависит от разницы — см. `UPGRADE_STARS`. */
export const GUARANTEE_MIN = UPGRADE_STARS;

export const guaranteePrice = (_gap: number) => UPGRADE_STARS;

export const guaranteeCost = (_fromStars: number, _toStars: number) => UPGRADE_STARS;