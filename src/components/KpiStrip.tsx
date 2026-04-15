import type { KpiCard } from "../types";

export function KpiStrip({ items }: { items: KpiCard[] }) {
  return (
    <section className="kpi-strip">
      {items.map((item) => (
        <article key={item.id} className={`kpi-card tone-${item.tone}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.hint}</p>
        </article>
      ))}
    </section>
  );
}
