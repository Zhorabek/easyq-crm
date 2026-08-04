import { useEffect } from 'react';
import { accentOnDark, brandTokens } from '../shared/brand';

/**
 * Paints the business's brand accent onto the CRM itself, so an owner who sets a colour
 * sees it on the tool they work in and not only on the customer-facing booking page.
 *
 * ## Only the accent, deliberately
 *
 * The booking page overrides all twelve tokens — background, text, panels, borders — and
 * that is right for a page whose whole job is to look like the business. The CRM must not.
 *
 * The CRM keeps its own surfaces and takes only the accent from the brand. There used to be a
 * light/dark toggle owning those surfaces; it is gone, but the split it forced was right on its
 * own merits and outlived it.
 *
 * That split matches what the two are for. A booking page is a shopfront. A CRM is a
 * dense working tool someone reads for eight hours, and a brand background chosen to look
 * good behind three buttons is not a colour to put behind a day's worth of tables.
 *
 * ## Why the surface still matters here
 *
 * `brandTokens` derives the accent shades against a background, which is the whole reason it
 * exists: `accentTint` moves away from the page and `accentDeep` toward legibility, in
 * whichever direction the background calls for. So it is handed the CRM's *own* surface, not
 * the brand's — otherwise a light brand would paint a near-white tint across the navy sidebar.
 */

/**
 * The CRM's own `--bg` / `--ink`, mirrored from crm.css.
 *
 * Duplicated because these must be read during a render and CSS custom properties are only
 * resolvable from the live DOM — reading them back with getComputedStyle would also read the
 * values this hook itself just wrote. If crm.css changes these two, change them here; nothing
 * breaks loudly, the derived shades just drift.
 */
const CRM_SURFACE = { bg: '#f4f6fa', ink: '#0f172a' };

/**
 * The sidebar, which is navy rather than the page colour and so needs its own accent.
 *
 * `--accent` fills the active nav item and the logo tile there. Derived against the page it
 * is fine on a white panel and can be invisible on the navy: a business whose brand is a
 * dark colour — and dark brands are common — would get an active nav item the same shade as
 * the sidebar it sits on, i.e. no visible selection anywhere in the CRM.
 */
const SIDEBAR_SURFACE = { bg: '#0e1626' };

const ACCENT_VARS = [
  '--accent',
  '--accent-deep',
  '--accent-tint',
  '--accent-ink',
  '--accent-nav',
  '--accent-nav-ink',
] as const;

export function useBrandAccent(accent: string | null | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    // No brand set, or signed out: drop the overrides so crm.css's defaults apply again.
    // Without this a business colour would survive a logout into the next person's session.
    if (!accent) {
      for (const v of ACCENT_VARS) root.style.removeProperty(v);
      return;
    }
    const tokens = brandTokens({ ...CRM_SURFACE, accent });
    root.style.setProperty('--accent', tokens.accent);
    root.style.setProperty('--accent-deep', tokens.accentDeep);
    root.style.setProperty('--accent-tint', tokens.accentTint);
    root.style.setProperty('--accent-ink', tokens.accentInk);

    const nav = accentOnDark(accent, SIDEBAR_SURFACE.bg);
    root.style.setProperty('--accent-nav', nav.fill);
    root.style.setProperty('--accent-nav-ink', nav.ink);
    return () => {
      for (const v of ACCENT_VARS) root.style.removeProperty(v);
    };
  }, [accent]);
}
