"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { configurableSections, configurableLinks, hiddenForPreset, MENU_PRESETS } from "@/lib/auth/menu-access";
import { cn } from "@/lib/utils";

const sections = configurableSections();
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function MenuAccessPage() {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
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
        setError("Could not load the menu settings.");
        return;
      }
      setSaved(j.data.hiddenUrls);
      setHidden(j.data.hiddenUrls);
      setCanEdit(j.data.canEdit);
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const dirty = saved !== null && !sameSet(saved, hidden);
  const activePreset = useMemo(() => MENU_PRESETS.find((p) => sameSet(hiddenForPreset(p.visible), hidden))?.id ?? null, [hidden]);
  const visibleCount = configurableLinks.length - hidden.length;

  const toggle = (url: string, show: boolean) => setHidden((h) => (show ? h.filter((x) => x !== url) : [...h, url]));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/menu-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenUrls: hidden }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        setError(j?.message ?? "Could not save. Try again.");
        return;
      }
      setSaved(j.data.hiddenUrls);
      setHidden(j.data.hiddenUrls);
      toast.success("Menu updated. Branch managers see it the next time they open the app.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-28 lg:p-6 lg:pb-28">
      <div>
        <h1 className="text-xl font-semibold">Menu access</h1>
        <p className="text-sm text-muted-foreground">Choose which pages each kind of user sees in the menu.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-background p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            Admin <Lock className="size-3.5 text-muted-foreground" aria-hidden />
          </p>
          <p className="text-sm text-muted-foreground">Sees everything. This can&apos;t be changed.</p>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            Cashier <Lock className="size-3.5 text-muted-foreground" aria-hidden />
          </p>
          <p className="text-sm text-muted-foreground">Sees only their till. This can&apos;t be changed.</p>
        </div>
      </div>

      <section className="space-y-5 rounded-xl border bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Branch manager</h2>
            <p className="text-sm text-muted-foreground">
              {saved === null ? "Loading…" : `Sees ${visibleCount} of ${configurableLinks.length} pages.`}
            </p>
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
                disabled={!canEdit || saved === null}
                onClick={() => setHidden(hiddenForPreset(p.visible))}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {!canEdit && saved !== null && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Only a super admin can change this. You can see the current setup here.</p>
        )}

        <div className="space-y-5">
          {sections.map((section, i) => (
            <div key={section.title}>
              {i > 0 && <Separator className="mb-5" />}
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h3>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const shown = !hidden.includes(item.url);
                  return (
                    <li key={item.url} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <label htmlFor={`menu-${item.url}`} className={cn("flex-1 cursor-pointer text-sm transition-colors duration-150 motion-reduce:transition-none", !shown && "text-muted-foreground")}>
                        {item.title}
                      </label>
                      <Switch id={`menu-${item.url}`} checked={shown} disabled={!canEdit || saved === null} onCheckedChange={(v) => toggle(item.url, v)} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Fiscal, Users, Branches and POS settings are for admins only. They can&apos;t be given to branch managers here.
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
            <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setHidden(saved ?? [])} disabled={saving} tabIndex={dirty ? 0 : -1}>
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
