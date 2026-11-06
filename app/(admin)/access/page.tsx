"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { grantableSections, MENU_PRESETS, ROLE_LABELS } from "@/lib/auth/menu-access";
import { GRANTABLE } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type EditableRole = keyof typeof ROLE_LABELS;
const ROLES = Object.keys(ROLE_LABELS) as EditableRole[];
const sections = grantableSections();
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function MenuAccessPage() {
  const [saved, setSaved] = useState<Record<EditableRole, string[]> | null>(null);
  const [draft, setDraft] = useState<Record<EditableRole, string[]> | null>(null);
  const [role, setRole] = useState<EditableRole>("branch_user");
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const r = await fetch("/api/admin/menu-access", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (ignore) return;
      if (!r.ok || !j?.success) {
        setError("Could not load the access settings.");
        return;
      }
      setSaved(j.data.roles);
      setDraft(j.data.roles);
      setCanEdit(j.data.canEdit);
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const current = useMemo(() => draft?.[role] ?? [], [draft, role]);
  const dirtyRoles = saved && draft ? ROLES.filter((r) => !sameSet(saved[r], draft[r])) : [];
  const dirty = dirtyRoles.length > 0;
  const activePreset = useMemo(() => MENU_PRESETS.find((p) => sameSet(p.keys(role), current))?.id ?? null, [role, current]);
  const pageCount = GRANTABLE.length;
  const cannotUseTill = draft !== null && !current.includes("/pos");

  const setFor = (r: EditableRole, keys: string[]) => setDraft((d) => (d ? { ...d, [r]: keys } : d));
  const toggle = (key: string, on: boolean) => setFor(role, on ? [...current, key] : current.filter((k) => k !== key));

  async function save() {
    if (!draft || !saved) return;
    setSaving(true);
    setError(null);
    try {
      const next = { ...saved };
      for (const r of dirtyRoles) {
        const res = await fetch("/api/admin/menu-access", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: r, allowed: draft[r] }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.success) {
          setError(j?.message ?? "Could not save. Try again.");
          setSaved(next);
          return;
        }
        next[r] = j.data.allowed;
      }
      setSaved(next);
      setDraft(next);
      toast.success("Access updated. It takes effect the next time each person's page loads.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-28 lg:p-6 lg:pb-28">
      <div>
        <h1 className="text-xl font-semibold">Menu access</h1>
        <p className="text-sm text-muted-foreground">Choose what each role can open and do. People are refused a page they were not given, even if they type its address.</p>
      </div>

      <div className="rounded-xl border bg-background p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          Admin <Lock className="size-3.5 text-muted-foreground" aria-hidden />
        </p>
        <p className="text-sm text-muted-foreground">Can open and do everything. This can&apos;t be changed, so nobody can lock themselves out.</p>
      </div>

      <section className="space-y-5 rounded-xl border bg-background p-5">
        <div role="tablist" aria-label="Role" className="inline-flex rounded-lg border bg-muted p-0.5">
          {ROLES.map((r) => (
            <button
              key={r}
              role="tab"
              type="button"
              aria-selected={role === r}
              onClick={() => setRole(r)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none",
                role === r ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {ROLE_LABELS[r].title}
              {dirtyRoles.includes(r) && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle" aria-label="unsaved changes" />}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">{ROLE_LABELS[role].title}</h2>
            <p className="text-sm text-muted-foreground">{ROLE_LABELS[role].blurb}</p>
            <p className="mt-1 text-sm text-muted-foreground">{draft === null ? "Loading…" : `Can use ${current.length} of ${pageCount} pages and actions.`}</p>
          </div>
          <div role="group" aria-label="Start from a preset" className="flex flex-wrap gap-2">
            {MENU_PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={activePreset === p.id ? "default" : "outline"}
                aria-pressed={activePreset === p.id}
                title={p.description}
                disabled={!canEdit || draft === null}
                onClick={() => setFor(role, p.keys(role))}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {!canEdit && draft !== null && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Only a super admin can change this. You can see the current setup here.</p>
        )}
        {canEdit && cannotUseTill && role === "cashier" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Cashiers are not allowed to open the till, so they will not be able to sell. Switch &ldquo;Open till&rdquo; back on.</p>
        )}

        <div className="space-y-5">
          {sections.map((section, i) => (
            <div key={section.title}>
              {i > 0 && <Separator className="mb-5" />}
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h3>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const on = current.includes(item.key);
                  return (
                    <li key={item.key} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <label htmlFor={`perm-${role}-${item.key}`} className={cn("flex-1 cursor-pointer text-sm transition-colors duration-150 motion-reduce:transition-none", !on && "text-muted-foreground")}>
                        {item.title}
                      </label>
                      <Switch id={`perm-${role}-${item.key}`} checked={on} disabled={!canEdit || draft === null} onCheckedChange={(v) => toggle(item.key, v)} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Menu access, Exchange rates, Quotations, Invoices and the shop homepage settings are for admins only and can&apos;t be given to other roles.
        </p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {canEdit && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
            dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
          )}
          aria-hidden={!dirty}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              You have unsaved changes{dirtyRoles.length > 0 ? ` for ${dirtyRoles.map((r) => ROLE_LABELS[r].title).join(" and ")}` : ""}.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft(saved)} disabled={saving} tabIndex={dirty ? 0 : -1}>
                Discard
              </Button>
              <Button onClick={() => void save()} disabled={saving} tabIndex={dirty ? 0 : -1}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
