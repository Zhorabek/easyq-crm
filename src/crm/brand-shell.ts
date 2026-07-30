import { useEffect } from 'react';
import { accentOnDark, brandTokens } from '../shared/brand';
import type { Theme } from './i18n';

/**
 * Paints the business's brand accent onto the CRM itself, so an owner who sets a colour
 * sees it on the tool they work in and not only on the customer-facing booking page.
 *
 * ## Only the accent, deliberately
 *
 * The booking page overrides all twelve tokens — background, text, panels, borders — and
 * that is right for a page whose whole job is to look like the business. The CRM must not.
 *
 * Those surface tokens are exactly what the Appearance light/dark toggle switches, and it
 * switches them through a `[data-theme='dark']` rule. Inline styles on the root element beat
 * any stylesheet rule, so writing `--bg` here would pin the CRM to the brand's background
 * and leave the dark-mode toggle visibly doing nothing. Rather than have the two features
 * fight and then explain the precedence to the owner in the UI, they are split by what they
 * own: Appearance owns the surfaces, branding owns the accent.
 *
 * That split also matches what the two are for. A booking page is a shopfront. A CRM is a
 * dense working tool someone reads for eight hours, and a brand background chosen to look
 * good behind three buttons is not a colour to put behind a day's worth of tables.
 *
 * ## Why the surface still matters here
 *
 * `brandTokens` derives the accent shades against a background, which is the whole reason it
 * exists: `accentTint` moves away from the page and `accentDeep` toward legibility, in
 * whichever direction the background calls for. So it is handed the CRM's *own* surface for
 * the current theme, not the brand's. The same lime accent therefore yields a pale tint on
 * the light CRM and a dark one on the dark CRM — instead of the near-white slab that a
 * light-brand tint would paint across a dark sidebar.
 */

/**
 * The CRM's own `--bg` / `--ink`, mirrored from crm.css.
 *
 * Duplicated because these must be read during a render and CSS custom properties are only
 * resolvable from the live DOM — reading them back with getComputedStyle would also read the
 * values this hook itself just wrote, which compounds on every theme change. If crm.css
 * changes these two, change them here; nothing breaks loudly, the derived shades just drift.
 */
const CRM_SURFACE: Record<Theme, { bg: string; ink: string }> = {
  light: { bg: '#f4f6fa', ink: '#0f172a' },
  dark: { bg: '#0a0f1a', ink: '#eaf0f7' },
};

/**
 * The sidebar, which is navy in *both* themes and so needs its own accent.
 *
 * `--accent` fills the active nav item and the logo tile there. Derived against the page it
 * is fine on a white panel and can be invisible on the navy: a business whose brand is a
 * dark colour — and dark brands are common — would get an active nav item the same shade as
 * the sidebar it sits on, i.e. no visible selection anywhere in the CRM.
 */
const SIDEBAR_SURFACE: Record<Theme, { bg: string }> = {
  light: { bg: '#0e1626' },
  dark: { bg: '#0c1320' },
};

const ACCENT_VARS = [
  '--accent',
  '--accent-deep',
  '--accent-tint',
  '--accent-ink',
  '--accent-nav',
  '--accent-nav-ink',
] as const;

export function useBrandAccent(accent: string | null | undefined, theme: Theme) {
  useEffect(() => {
    const root = document.documentElement;
    // No brand set, or signed out: drop the overrides so crm.css's defaults apply again.
    // Without this a business colour would survive a logout into the next person's session.
    if (!accent) {
      for (const v of ACCENT_VARS) root.style.removeProperty(v);
      return;
    }
    const tokens = brandTokens({ ...CRM_SURFACE[theme], accent });
    root.style.setProperty('--accent', tokens.accent);
    root.style.setProperty('--accent-deep', tokens.accentDeep);
    root.style.setProperty('--accent-tint', tokens.accentTint);
    root.style.setProperty('--accent-ink', tokens.accentInk);

    const nav = accentOnDark(accent, SIDEBAR_SURFACE[theme].bg);
    root.style.setProperty('--accent-nav', nav.fill);
    root.style.setProperty('--accent-nav-ink', nav.ink);
    return () => {
      for (const v of ACCENT_VARS) root.style.removeProperty(v);
    };
  }, [accent, theme]);
}
