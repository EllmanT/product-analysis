"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Me {
  name: string;
  surname: string;
  email: string;
  role: "admin" | "branch_user" | "cashier";
  branch: string | null;
  hasPassword: boolean;
}

const ROLE: Record<Me["role"], string> = { admin: "Administrator", branch_user: "Branch manager", cashier: "Cashier" };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { update } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"details" | "password" | null>(null);
  const [error, setError] = useState<{ where: "details" | "password"; message: string } | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const j = await fetch("/api/profile", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (ignore || !j?.success) return;
      setMe(j.data);
      setName(j.data.name);
      setSurname(j.data.surname);
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function send(where: "details" | "password", body: Record<string, string>) {
    setBusy(where);
    setError(null);
    try {
      const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) return setError({ where, message: j?.message ?? "Could not save" });
      toast.success(where === "details" ? "Your name is saved" : "Your password is changed");
      if (where === "password") {
        setCurrent("");
        setNext("");
      } else {
        setMe((m) => (m ? { ...m, name: body.name, surname: body.surname } : m));
        void update?.();
      }
    } finally {
      setBusy(null);
    }
  }

  if (!me) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold">My profile</h1>
        <p className="text-sm text-muted-foreground">
          {me.email} · {ROLE[me.role]}
          {me.branch ? ` · ${me.branch}` : ""}
        </p>
      </div>

      <section className="space-y-4 rounded-xl border bg-background p-5">
        <h2 className="font-medium">Your name</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field label="Surname">
            <Input value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="family-name" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void send("details", { name: name.trim(), surname: surname.trim() })} disabled={busy !== null || (name.trim() === me.name && surname.trim() === me.surname)}>
            {busy === "details" ? "Saving…" : "Save name"}
          </Button>
          {error?.where === "details" && (
            <span role="alert" className="text-sm text-destructive">
              {error.message}
            </span>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-background p-5">
        <h2 className="font-medium">Password</h2>
        {me.hasPassword ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Current password">
                <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="New password" hint="At least 8 characters.">
                <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => void send("password", { currentPassword: current, newPassword: next })} disabled={busy !== null || !current || next.length < 8}>
                {busy === "password" ? "Changing…" : "Change password"}
              </Button>
              {error?.where === "password" && (
                <span role="alert" className="text-sm text-destructive">
                  {error.message}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">You sign in with Google or GitHub, so there is no password to change here.</p>
        )}
      </section>
    </div>
  );
}
