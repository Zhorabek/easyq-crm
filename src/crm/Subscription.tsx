import { useState } from 'react';
import type { SubscriptionInfo } from '../types';
import { CRM_LANGS, useCRM } from './i18n';
import { Ic } from './icons';
import { CRMLogo } from './ui';

/**
 * What the owner sees when the subscription has run out, and the strip that warns them before
 * it does.
 *
 * ## What "expired" blocks, and what it deliberately does not
 *
 * The CRM stops. The PUBLIC BOOKING PAGE keeps working, and so do both Telegram bots. That is a
 * deliberate line: the shop has an unpaid bill, but their customers did nothing wrong, and a
 * customer who cannot book is a customer who books somewhere else. Punishing them would cost
 * the shop the very money we are asking for.
 *
 * ## There is no payment gateway
 *
 * Nothing here charges a card, because nothing is integrated. The buttons open a conversation,
 * and somebody activates the plan by hand. Pretending otherwise — a "Pay" button that leads
 * nowhere — would be worse than saying so.
 */

/**
 * The person who actually turns a plan on, not a bot.
 *
 * A bot cannot activate a subscription — somebody has to take payment and run the UPDATE — so
 * sending owners to one would be sending them to a dead end with a friendly interface.
 */
const MANAGER_USERNAME = 'easyq_manager';
const MANAGER_URL = `https://t.me/${MANAGER_USERNAME}`;

/**
 * Open the manager's chat with the request already typed.
 *
 * `?text=` on a PUBLIC USERNAME link is documented — core.telegram.org/api/links:
 *
 *   t.me/<username>?text=<draft_text>
 *   "UTF-8 text to pre-enter into the text input bar, if the user can write in the chat."
 *
 * Not just for bots, which is what an earlier version of this file assumed on its way to using
 * t.me/share/url instead. That worked, but it opens a chat PICKER titled "Forward to…", and an
 * owner who clicked "Choose" had every reason to wonder what they were forwarding.
 *
 * A client too old to honour the parameter ignores it and opens the chat anyway, which is the
 * behaviour we would have had regardless — so there is no version of this that is worse than
 * doing nothing.
 *
 * Telegram prepends a space when draft text starts with `@`, to avoid triggering an inline
 * query. Ours starts with a greeting, so that never fires, but it is why the manager's username
 * is not the first thing in the message.
 */
function chatUrl(message: string) {
  return `${MANAGER_URL}?text=${encodeURIComponent(message)}`;
}

function requestText(planLabel: string, price: number, bizName: string, staffCount: number) {
  return [
    'Здравствуйте! Хочу подключить подписку EasyQ.',
    '',
    `Бизнес: ${bizName}`,
    `Сотрудников: ${staffCount || '—'}`,
    `Тариф: ${planLabel} — ${new Intl.NumberFormat('ru-RU').format(price)} so'm/мес`,
  ].join('\n');
}

/** Best-effort copy. An owner on an old browser still gets the chat, just without the text. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function money(value: number) {
  return `${new Intl.NumberFormat('ru-RU').format(value)} so'm`;
}

/** One tier. `recommended` gets the accent; a tier too small for the team is dimmed. */
function PlanCard({
  plan,
  onPick,
}: {
  plan: SubscriptionInfo['plans'][number];
  onPick: () => void;
}) {
  const { t } = useCRM();
  const dim = !plan.fitsTeam;

  return (
    <div
      style={{
        position: 'relative',
        border: `2px solid ${plan.recommended ? 'var(--accent)' : 'var(--line-2)'}`,
        borderRadius: 16,
        padding: '20px 18px',
        background: plan.recommended ? 'var(--accent-tint)' : 'var(--panel)',
        opacity: dim ? 0.5 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {plan.recommended && (
        <span
          style={{
            position: 'absolute', top: -11, left: 16, background: 'var(--accent)',
            color: 'var(--accent-ink)', fontSize: 11, fontWeight: 800, padding: '3px 10px',
            borderRadius: 999, letterSpacing: '.02em',
          }}
        >
          {t.sub.recommended}
        </span>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
        {t.sub.upTo} {plan.maxStaff} {t.sub.staffWord}
      </div>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>
        {money(plan.price)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{t.sub.perMonth}</div>

      {/* Said plainly rather than just greying the card out: "you have 6 people, this covers 5"
          is the reason, and without it a disabled button is a mystery. */}
      {dim && (
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--amber)' }}>{t.sub.tooSmall}</div>
      )}

      <button
        onClick={onPick}
        disabled={dim}
        style={{
          marginTop: 'auto', padding: '11px', borderRadius: 11, fontSize: 13.5, fontWeight: 800,
          background: plan.recommended ? 'var(--accent)' : 'var(--panel-2)',
          color: plan.recommended ? 'var(--accent-ink)' : 'var(--ink)',
          border: plan.recommended ? 'none' : '1px solid var(--line-2)',
          cursor: dim ? 'not-allowed' : 'pointer',
        }}
      >
        {t.sub.choose}
      </button>
    </div>
  );
}

export function PlanGrid({
  subscription,
  onPicked,
}: {
  subscription: SubscriptionInfo;
  onPicked?: (copied: boolean) => void;
}) {
  const { t, bizName } = useCRM();

  const pick = async (plan: SubscriptionInfo['plans'][number]) => {
    const label = `${t.sub.upTo} ${plan.maxStaff} ${t.sub.staffWord}`;
    const message = requestText(label, plan.price, bizName, subscription.staffCount);

    // Copied FIRST: a clipboard write from a document that has just lost focus to a new tab is
    // refused by browsers that implement the permission properly. This is the belt to the
    // draft's braces — an ancient client that drops ?text= still leaves them something to paste.
    const copied = await copyText(message);
    window.open(chatUrl(message), '_blank', 'noopener');
    onPicked?.(copied);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
      {subscription.plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} onPick={() => void pick(plan)} />
      ))}
    </div>
  );
}

/** The full-screen state. Replaces the CRM entirely once the subscription has lapsed. */
export function SubscriptionExpired({ subscription }: { subscription: SubscriptionInfo }) {
  const { t, lang, setLang } = useCRM();
  const [copied, setCopied] = useState<boolean | null>(null);
  const lapsedFor = subscription.daysLeft === null ? null : Math.abs(subscription.daysLeft);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 20px', background: 'var(--bg)' }}>
      {/* Top right, out of the way.
          This screen replaces the whole CRM, and the language switcher lives in the shell it
          replaced — so an owner who reads Uzbek was stuck on whichever language happened to be
          set, on the one screen asking them to spend money. It sat beside the logo first, which
          made a centred lockup into a lopsided one; the corner is where a utility control
          belongs and where every other product puts it. */}
      <div style={{ position: 'absolute', top: 18, right: 20, display: 'inline-flex', gap: 2, background: 'var(--panel-2)', borderRadius: 999, padding: 3 }}>
        {CRM_LANGS.map((L) => {
          const on = lang === L.code;
          return (
            <button
              key={L.code}
              onClick={() => setLang(L.code)}
              style={{
                fontSize: 12.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                color: on ? 'var(--accent-ink)' : 'var(--ink-3)',
                background: on ? 'var(--accent)' : 'transparent',
              }}
            >
              {L.label}
            </button>
          );
        })}
      </div>

      <div style={{ width: '100%', maxWidth: 880 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <CRMLogo on="light" />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <span
            style={{
              display: 'inline-grid', placeItems: 'center', width: 54, height: 54, borderRadius: '50%',
              background: 'var(--amber-t)', color: 'var(--amber)', marginBottom: 14,
            }}
          >
            <Ic name="clock" size={26} stroke={2.2} />
          </span>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.025em', margin: '0 0 8px' }}>
            {subscription.onTrial ? t.sub.trialOverTitle : t.sub.expiredTitle}
          </h1>
          <p className="pretty" style={{ fontSize: 15, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 }}>
            {subscription.onTrial ? t.sub.trialOverSub : t.sub.expiredSub}
            {lapsedFor !== null && lapsedFor > 0 ? ` ${t.sub.lapsedDays(lapsedFor)}` : ''}
          </p>
        </div>

        <PlanGrid subscription={subscription} onPicked={setCopied} />

        {/* Shown only after they pick, because before that there is nothing to paste. Says
            which of the two things happened: the clipboard is a permission, not a guarantee. */}
        {copied !== null && (
          <p style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--accent-deep)', marginTop: 18, lineHeight: 1.6 }}>
            {copied ? t.sub.pasteInChat : t.sub.tellManager}
          </p>
        )}

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, marginTop: 22, lineHeight: 1.6 }}>
          {/* Told up front, because a shop panicking about lost bookings is the whole reason
              somebody would ignore this screen. */}
          {t.sub.bookingStillWorks}
        </p>
      </div>
    </div>
  );
}

/**
 * The warning strip, shown while the trial is still running.
 *
 * Only inside the last week. A countdown from day one is noise somebody learns to ignore, and
 * then it is still being ignored on the day it matters.
 */
export function SubscriptionBanner({ subscription }: { subscription: SubscriptionInfo }) {
  const { t } = useCRM();
  if (!subscription.active) return null;
  if (subscription.daysLeft === null || subscription.daysLeft > 7) return null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', background: 'var(--amber-t)', color: 'var(--amber)',
        fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--line)',
      }}
    >
      <Ic name="clock" size={16} stroke={2.2} />
      <span>
        {subscription.onTrial
          ? t.sub.trialEndsIn(subscription.daysLeft)
          : t.sub.planEndsIn(subscription.daysLeft)}
      </span>
      <a
        href={MANAGER_URL}
        target="_blank"
        rel="noopener"
        style={{ marginLeft: 'auto', color: 'inherit', textDecoration: 'underline', fontWeight: 800 }}
      >
        {t.sub.choosePlan}
      </a>
    </div>
  );
}
