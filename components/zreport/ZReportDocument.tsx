"use client";

import type { ZReportBreakdown } from "@/lib/zReportBreakdown";

export type ZReportDetail = {
  _id: string;
  source: string;
  closedAt: string;
  fiscalDayNo: number | null;
  deviceName?: string;
  deviceId?: string | null;
  deviceSerialNumber?: string | null;
  company?: { name: string; address: string; phone: string; tin: string; vatNumber: string };
  totalSalesUsd: number | null;
  totalSalesZwg: number | null;
  breakdown?: ZReportBreakdown | null;
  setAsideCount?: number;
  rawCloseResponse?: unknown;
};

export type ZReportLayout = "a4" | "slip";

const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = (n: number) => nf.format(n);

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Harare",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

const rate = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(2)}%`;

/** Totals ZIMRA gave when no breakdown could be worked out (older reports). */
function fallbackTotals(r: ZReportDetail): { currency: string; gross: number }[] {
  const out: { currency: string; gross: number }[] = [];
  if (r.totalSalesUsd != null) out.push({ currency: "USD", gross: r.totalSalesUsd });
  if (r.totalSalesZwg != null) out.push({ currency: "ZWG", gross: r.totalSalesZwg });
  return out;
}

function Details({ r }: { r: ZReportDetail }) {
  const rows: [string, string][] = [
    ["Fiscal day", r.fiscalDayNo != null ? String(r.fiscalDayNo) : "—"],
    ["Device", r.deviceName || "—"],
    ["Device ID", r.deviceId || "—"],
    ["Serial no.", r.deviceSerialNumber || "—"],
    ["Closed", when(r.closedAt)],
    ["Closed by", r.source === "scheduled" ? "Automatic close" : "Manual close"],
  ];
  return (
    <dl className="zr-details">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Currency({ c }: { c: ZReportBreakdown["currencies"][number] }) {
  return (
    <section className="zr-section">
      <table className="zr-table">
        <thead>
          <tr>
            <th colSpan={4}>Summary: {c.currency}</th>
          </tr>
          <tr className="zr-sub">
            <th>VAT rate</th>
            <th>Nett</th>
            <th>Tax</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {c.rates.map((x) => (
            <tr key={x.taxPercent}>
              <td>{rate(x.taxPercent)}</td>
              <td className="num">{fmt(x.nett)}</td>
              <td className="num">{fmt(x.tax)}</td>
              <td className="num">{fmt(x.gross)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Day total</td>
            <td className="num">{fmt(c.nett)}</td>
            <td className="num">{fmt(c.tax)}</td>
            <td className="num">{fmt(c.gross)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="zr-note">
        {c.receipts} receipt{c.receipts === 1 ? "" : "s"}
        {c.creditNotes > 0 && (
          <>
            {" "}
            · {c.creditNotes} credit note{c.creditNotes === 1 ? "" : "s"} ({c.currency} {fmt(Math.abs(c.creditsGross))} taken off)
          </>
        )}
      </p>
    </section>
  );
}

/** One Z-report, laid out for paper: an A4 page or an 80mm till slip. */
export default function ZReportDocument({ report, layout = "a4" }: { report: ZReportDetail; layout?: ZReportLayout }) {
  const b = report.breakdown;
  const fb = !b || b.currencies.length === 0 ? fallbackTotals(report) : [];
  const co = report.company;
  return (
    <article className={`zr zr-${layout}`}>
      <div className="zr-head">
        <h1>Z report</h1>
        {co?.name && <p className="zr-company">{co.name}</p>}
        {co?.address && <p>{co.address}</p>}
        {co?.phone && <p>Tel {co.phone}</p>}
        {co?.tin && <p>TIN {co.tin}</p>}
        {co?.vatNumber && <p>VAT no. {co.vatNumber}</p>}
      </div>

      <Details r={report} />

      {b?.currencies.map((c) => (
        <Currency key={c.currency} c={c} />
      ))}

      {fb.length > 0 && (
        <section className="zr-section">
          <table className="zr-table">
            <thead>
              <tr>
                <th colSpan={2}>Totals</th>
              </tr>
            </thead>
            <tbody>
              {fb.map((t) => (
                <tr key={t.currency}>
                  <td>Day total {t.currency}</td>
                  <td className="num">{fmt(t.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="zr-note">The tax split is not available for this report.</p>
        </section>
      )}

      {!b && fb.length === 0 && <p className="zr-note">No sales figures were recorded for this report.</p>}

      {(report.setAsideCount ?? 0) > 0 && (
        <p className="zr-warn">
          {report.setAsideCount} receipt{report.setAsideCount === 1 ? " was" : "s were"} refused by the fiscal device and set aside for review. They are
          not in the figures above.
        </p>
      )}

      <footer className="zr-foot">Printed {when(new Date().toISOString())}</footer>
    </article>
  );
}

/** Styles for the document and for printing it. Rendered once per page that shows a Z-report. */
export function ZReportStyles({ layout }: { layout: ZReportLayout }) {
  return (
    <style>{`
      .zr { color: #111; background: #fff; font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; font-size: 13px; line-height: 1.45; }
      .zr h1 { font-size: 22px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.01em; }
      .zr p { margin: 0; }
      .zr-company { font-weight: 600; text-transform: uppercase; }
      .zr-details { display: grid; gap: 2px 24px; margin: 14px 0 6px; padding: 10px 0; border-top: 1px solid #111; border-bottom: 1px solid #ccc; }
      .zr-details div { display: flex; justify-content: space-between; gap: 12px; }
      .zr-details dt { color: #555; }
      .zr-details dd { margin: 0; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
      .zr-section { margin-top: 18px; break-inside: avoid; }
      .zr-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
      .zr-table th, .zr-table td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #ddd; }
      .zr-table thead tr:first-child th { background: #e9e9e9; font-size: 14px; border-bottom: 1px solid #999; }
      .zr-table .zr-sub th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #444; }
      .zr-table .num, .zr-table .zr-sub th:not(:first-child) { text-align: right; }
      .zr-table tfoot td { font-weight: 700; border-top: 2px solid #111; border-bottom: 0; }
      .zr-note { margin-top: 6px; color: #555; font-size: 12px; }
      .zr-warn { margin-top: 16px; padding: 8px 10px; border: 1px solid #b45309; color: #7c2d12; font-size: 12px; }
      .zr-foot { margin-top: 24px; color: #777; font-size: 11px; }
      .zr-a4 { width: 100%; max-width: 760px; margin: 0 auto; }
      .zr-a4 .zr-details { grid-template-columns: 1fr 1fr; }
      .zr-slip { width: 72mm; margin: 0 auto; font-size: 11px; }
      .zr-slip h1 { font-size: 16px; text-align: center; }
      .zr-slip .zr-head { text-align: center; }
      .zr-slip .zr-table th, .zr-slip .zr-table td { padding: 2px 3px; }
      .zr-slip .zr-table thead tr:first-child th { background: none; border-bottom: 1px dashed #111; font-size: 12px; }
      .zr-pagebreak { break-after: page; }
      @media print {
        @page { size: ${layout === "slip" ? "80mm auto" : "A4"}; margin: ${layout === "slip" ? "4mm" : "14mm"}; }
        html, body { background: #fff !important; }
        .zr-screen, .zr-screen * { visibility: visible !important; }
        [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-slot="sidebar-container"], header { display: none !important; }
        [data-slot="sidebar-inset"], main { margin: 0 !important; box-shadow: none !important; background: #fff !important; }
        .zr-a4, .zr-slip { max-width: none; }
        .zr-table thead tr:first-child th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
  );
}
