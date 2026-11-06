"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Api<T> = { success: boolean; message?: string; data?: T; backend?: string };
interface Admin {
  id: string;
  name: string;
  email: string;
}
interface Settings {
  recipientMode: "all_admins" | "selected";
  userIds: string[];
  extraEmails: string[];
}
interface Alert {
  id: string;
  deviceKey: string;
  kind: string;
  message: string;
  day: string;
  count: number;
  lastAt: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<Api<T>> {
  try {
    const r = await fetch(url, init);
    return ((await r.json().catch(() => null)) as Api<T> | null) ?? { success: false, message: `Request failed (${r.status})` };
  } catch {
    return { success: false, message: "Network error" };
  }
}

/** Open alerts from the fiscal service (acknowledge them) and who gets the alert emails. */
export default function FiscalAlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [backend, setBackend] = useState("legacy");
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      api<Alert[]>("/api/admin/fiscal-alerts"),
      api<{ settings: Settings; admins: Admin[] }>("/api/admin/fiscal-alert-settings"),
    ]);
    if (a.success) {
      setAlerts(a.data ?? []);
      setBackend(a.backend ?? "legacy");
    }
    if (s.success && s.data) {
      setSettings(s.data.settings);
      setAdmins(s.data.admins);
      setExtra(s.data.settings.extraEmails.join(", "));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const ack = async (id: string) => {
    const r = await api("/api/admin/fiscal-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.success) setAlerts((x) => x.filter((a) => a.id !== id));
    else toast.error(r.message ?? "Could not acknowledge");
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const r = await api<Settings>("/api/admin/fiscal-alert-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, extraEmails: extra.split(/[,;\s]+/).filter(Boolean) }),
    });
    setSaving(false);
    if (r.success) {
      toast.success("Alert recipients saved");
      void load();
    } else toast.error(typeof r.message === "string" ? r.message : "Could not save");
  };

  const toggle = (id: string) =>
    setSettings((s) =>
      s ? { ...s, userIds: s.userIds.includes(id) ? s.userIds.filter((x) => x !== id) : [...s.userIds, id] } : s,
    );

  return (
    <section className="space-y-5 rounded-lg border p-4">
      <div>
        <h2 className="text-base font-semibold">Fiscal alerts</h2>
        <p className="text-sm text-muted-foreground">
          Problems the fiscal service has raised. Each one is emailed once per day, then stays here until someone acknowledges it.
        </p>
      </div>

      {backend !== "service" ? (
        <p className="text-sm text-muted-foreground">The fiscal service is not in use yet, so there are no service alerts.</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm">No open alerts.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-4 p-3 text-sm">
              <div className="space-y-0.5">
                <div className="font-medium">
                  {a.kind.replaceAll("_", " ").toLowerCase()}{" "}
                  <span className="font-normal text-muted-foreground">
                    device {a.deviceKey}, {a.day}
                    {a.count > 1 ? `, ${a.count} times` : ""}
                  </span>
                </div>
                <div className="text-muted-foreground">{a.message}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => void ack(a.id)}>
                Acknowledge
              </Button>
            </li>
          ))}
        </ul>
      )}

      {settings && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">Who gets the alert emails</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={settings.recipientMode === "all_admins"} onChange={() => setSettings({ ...settings, recipientMode: "all_admins" })} />
              Every administrator
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={settings.recipientMode === "selected"} onChange={() => setSettings({ ...settings, recipientMode: "selected" })} />
              Only the administrators I choose
            </label>
          </div>
          {settings.recipientMode === "selected" && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {admins.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={settings.userIds.includes(a.id)} onChange={() => toggle(a.id)} />
                  {a.name} <span className="text-muted-foreground">{a.email}</span>
                </label>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="alert-extra">Extra email addresses (optional, comma separated)</Label>
            <Input id="alert-extra" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="accounts@company.com" />
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save recipients"}
          </Button>
        </div>
      )}
    </section>
  );
}
