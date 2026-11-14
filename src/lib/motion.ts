import type { Transition, Variants } from "framer-motion";

/**
 * Общие пружины и варианты анимаций.
 *
 * Плавность в интерфейсе — это не «побольше transition», а физика: элементы
 * должны двигаться как предметы с массой, а не как CSS-линейка. Поэтому вместо
 * `duration` везде используется `spring`, а кривые задаются один раз здесь,
 * чтобы скорость ощущалась одинаково на всех экранах.
 *
 * Три пресета:
 *   • `SPRING_SOFT`  — основной: списки, карточки, появление;
 *   • `SPRING_SNAPPY`— микро-жесты (нажатие, смена таба), почти без инерции;
 *   • `SPRING_GLIDE` — большие перемещения (перетаскивание), мягче и медленнее.
 *
 * Почему не CSS-переходы: у пружины нет «обратного хода» при прерывании —
 * если жест поймали посередине, элемент доедет из текущей точки, а не прыгнет
 * в начало. Именно это читается как «гладко».
 */
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 240, damping: 30, mass: 0.9 };

export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.6 };

export const SPRING_GLIDE: Transition = { type: "spring", stiffness: 170, damping: 26, mass: 1 };

/** Мягкое «выезжание» для наложений: быстрый старт, длинный хвост. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * Контейнер списка: заголовок «hidden/show» сам раскатывает детей.
 * `staggerChildren` маленький специально — прилавок на 50 карточек не должен
 * «доигрывать» дольше, чем на него смотрят.
 */
export const LIST_CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.012, delayChildren: 0.02 } },
};

/** Карточка списка: поднимается снизу и «доезжает» пружиной. */
export const LIST_ITEM: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT },
};