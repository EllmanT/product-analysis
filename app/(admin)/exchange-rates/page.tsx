"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type RateRow = {
  _id: string;
  currency: string;
  rate: number;
  effectiveDate: string;
  notes?: string;
  createdAt: string;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ExchangeRatesPage() {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/exchange-rates");
      const body = (await res.json()) as { success: boolean; data?: RateRow[] };
      if (body.success && Array.isArray(body.data)) {
        setRows(body.data);
      }
    } catch {
      setErrorMsg("Failed to load exchange rates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRates();
  }, [loadRates]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMsg("");
      setSuccessMsg("");

      const rateNum = parseFloat(rate);
      if (!currency || Number.isNaN(rateNum) || rateNum <= 0) {
        setErrorMsg("Please enter a valid currency code and rate.");
        return;
      }

      setSaving(true);
      try {
        const res = await fetch("/api/admin/exchange-rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currency: currency.toUpperCase(),
            rate: rateNum,
            effectiveDate,
            notes: notes || undefined,
          }),
        });
        const body = (await res.json()) as { success: boolean; error?: { message?: string } };
        if (!res.ok) {
          setErrorMsg(body?.error?.message ?? "Failed to save exchange rate.");
          return;
        }
        setSuccessMsg(`Rate for ${currency.toUpperCase()} saved successfully.`);
        setCurrency("");
        setRate("");
        setNotes("");
        void loadRates();
      } catch {
        setErrorMsg("Network error. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [currency, rate, effectiveDate, notes, loadRates]
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Exchange Rates</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the local currency exchange rates used for EcoCash payments.
        </p>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Rate format:</strong> units of local currency per 1 USD.
          Example: if 1 USD = 3600 ZWG, enter rate as <strong>3600</strong>.
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Add new rate form */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Add New Rate</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Currency Code
              </label>
              <input
                type="text"
                placeholder="e.g. ZWG"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={10}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Rate (local per 1 USD)
              </label>
              <input
                type="number"
                placeholder="e.g. 3600"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                step="any"
                min="0"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Effective Date
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notes (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. RBZ official rate"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMsg}
            </p>
          )}
          {successMsg && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMsg}
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Add Rate"}
          </Button>
        </form>
      </div>

      {/* Rates table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading exchange rates…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No exchange rates configured yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Currency</th>
                  <th className="px-4 py-3">Rate (local / 1 USD)</th>
                  <th className="px-4 py-3">Effective Date</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                      {row.currency}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.rate.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(row.effectiveDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{row.notes ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
