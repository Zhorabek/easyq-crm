import type { SubscriptionInfo } from '../types';
import { useCRM } from './i18n';
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

const CONTACT_URL = 'https://t.me/easyqueue_business_bot';

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

export function PlanGrid({ subscription }: { subscription: SubscriptionInfo }) {
  const pick = (planId: string) => {
    // No gateway to send them to, so this opens the conversation that actually activates a
    // plan. The chosen tier rides along so nobody has to be asked which one they meant.
    window.open(`${CONTACT_URL}?start=plan_${planId}`, '_blank', 'noopener');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
      {subscription.plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} onPick={() => pick(plan.id)} />
      ))}
    </div>
  );
}

/** The full-screen state. Replaces the CRM entirely once the subscription has lapsed. */
export function SubscriptionExpired({ subscription }: { subscription: SubscriptionInfo }) {
  const { t } = useCRM();
  const lapsedFor = subscription.daysLeft === null ? null : Math.abs(subscription.daysLeft);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 20px', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 880 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}><CRMLogo on="light" /></div>

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

        <PlanGrid subscription={subscription} />

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
        href={`${CONTACT_URL}?start=plan_${subscription.plans.find((p) => p.recommended)?.id ?? ''}`}
        target="_blank"
        rel="noopener"
        style={{ marginLeft: 'auto', color: 'inherit', textDecoration: 'underline', fontWeight: 800 }}
      >
        {t.sub.choosePlan}
      </a>
    </div>
  );
}
