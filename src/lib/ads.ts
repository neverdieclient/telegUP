/**
 * Adsterra banners — where the ads live on the site.
 *
 * Fill in a slot, flip ADS_ENABLED to true, deploy. Until then the site is
 * banner-free: every slot is null and the AdSlot component renders nothing.
 *
 * How to get the values (Adsterra Publisher account, website approved):
 *   1. Websites → New Website (your domain). Wait for moderation.
 *   2. Creatives → New banner / direct link.
 *   3. In the embed code you get:
 *        - `atOptions.key`      → put it in `key`
 *        - the script host       → the `…invoke.js` host, put it in `host`
 *        - sizes                 → width/height of the banner
 *
 * `host` is always something like `flux.adsterra.com` or `your-sub.reklond.com`
 * — copy it verbatim from the generated code, without `https://` or a slash.
 *
 * Only filled slots render; set ADS_ENABLED = false to kill ads everywhere
 * without touching the layout or the components.
 */

export type AdSlotId = "top" | "inline" | "footer";

export type AdSlotConfig = {
  /** `atOptions.key` from the Adsterra code. */
  key: string;
  /** Host of the `invoke.js` loader, e.g. "flux.adsterra.com". */
  host: string;
  /** Banner width in px. */
  width: number;
  /** Banner height in px. */
  height: number;
  /** Hide on phones — big banners eat half a small screen. */
  desktopOnly?: boolean;
};

/**
 * Leave a slot `null` to keep it switched off. Only filled slots render,
 * so the site looks normal until the account is approved.
 */
export const AD_SLOTS: Record<AdSlotId, AdSlotConfig | null> = {
  // 728×90 under the header — highest value, most visible.
  top: null,
  // 300×250 between content blocks — does not interrupt play.
  inline: null,
  // 320×50 in the footer — barely noticeable, on every page.
  footer: null,
};

/** Master switch for the whole site. Turn on after Adsterra approval. */
export const ADS_ENABLED = false;