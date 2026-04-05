"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Warehouse } from "lucide-react";
import { useState } from "react";

type Step = 1 | 2 | 3;

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  tradeName: string;
  phone: string;
  address: string;
  tinNumber: string;
  vatNumber: string;
};

const INITIAL_FORM: FormData = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
  tradeName: "",
  phone: "",
  address: "",
  tinNumber: "",
  vatNumber: "",
};

function passwordStrength(p: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return score as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH_COLORS = [
  "",
  "bg-red-400",
  "bg-orange-400",
  "bg-yellow-400",
  "bg-green-500",
];
const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

function StepDots({ current, completed }: { current: Step; completed: Step[] }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-3">
      {([1, 2, 3] as Step[]).map((s) => {
        const done = completed.includes(s);
        const active = current === s;
        return (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                done
                  ? "bg-blue-600 text-white"
                  : active
                  ? "border-2 border-blue-600 text-blue-600"
                  : "border-2 border-slate-200 text-slate-400"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 3 && (
              <div
                className={`h-0.5 w-8 rounded-full transition-all ${
                  done ? "bg-blue-600" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none ring-blue-500 transition focus:ring-2"
      />
    </div>
  );
}

export default function ShopRegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [completedSteps, setCompletedSteps] = useState<Step[]>([]);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function set(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setStepError(null);
  }

  function validateStep1(): string | null {
    if (!form.firstName.trim() || !form.lastName.trim())
      return "Please enter your first and last name.";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      return "Please enter a valid email address.";
    if (form.password.length < 8)
      return "Password must be at least 8 characters.";
    if (form.password !== form.confirmPassword)
      return "Passwords do not match.";
    return null;
  }

  function validateStep2(): string | null {
    if (!form.tradeName.trim()) return "Trade name is required.";
    if (!form.phone.trim()) return "Phone number is required.";
    if (!form.address.trim()) return "Address is required.";
    return null;
  }

  function validateStep3(): string | null {
    if (!form.tinNumber.trim()) return "TIN number is required.";
    if (!form.vatNumber.trim()) return "VAT number is required.";
    return null;
  }

  function handleNext() {
    const err = step === 1 ? validateStep1() : validateStep2();
    if (err) { setStepError(err); return; }
    setCompletedSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
    setStep((s) => (s + 1) as Step);
    setStepError(null);
  }

  function handleBack() {
    setStep((s) => (s - 1) as Step);
    setStepError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) { handleNext(); return; }
    const err = validateStep3();
    if (err) { setStepError(err); return; }

    setLoading(true);
    setStepError(null);

    try {
      const res = await fetch("/api/shop/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phone: form.phone.trim(),
          tradeName: form.tradeName.trim(),
          tinNumber: form.tinNumber.trim(),
          vatNumber: form.vatNumber.trim(),
          address: form.address.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setStep(1);
          setStepError("An account with this email already exists.");
          return;
        }
        setStepError(json?.error?.message ?? "Registration failed. Please try again.");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 2000);
    } catch {
      setStepError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const strength = passwordStrength(form.password);

  if (success) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Account created!</h2>
          <p className="mt-2 text-sm text-slate-500">Redirecting you to the shop…</p>
          <div className="mx-auto mt-5 h-1 w-48 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ animation: "progress 2s linear forwards" }}
            />
          </div>
        </div>
        <style>{`@keyframes progress { from { width: 0% } to { width: 100% } }`}</style>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        {/* Logo */}
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
            <Warehouse className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">StockFlow</span>
        </div>

        <StepDots current={step} completed={completedSteps} />

        <form onSubmit={handleSubmit}>
          {/* ── Step 1 ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900">Create your account</h2>
                <p className="mt-1 text-sm text-slate-500">Step 1 of 3 — Personal details</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name" id="reg-first" value={form.firstName}
                  onChange={(v) => set("firstName", v)} placeholder="John" autoComplete="given-name" />
                <Field label="Last Name" id="reg-last" value={form.lastName}
                  onChange={(v) => set("lastName", v)} placeholder="Doe" autoComplete="family-name" />
              </div>

              <Field label="Email address" id="reg-email" type="email" value={form.email}
                onChange={(v) => set("email", v)} placeholder="you@example.com" autoComplete="email" />

              {/* Password */}
              <div>
                <label htmlFor="reg-password" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <input id="reg-password" type={showPassword ? "text" : "password"}
                    value={form.password} onChange={(e) => set("password", e.target.value)}
                    placeholder="Min. 8 characters" autoComplete="new-password" required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-11 text-slate-900 outline-none ring-blue-500 transition focus:ring-2"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((seg) => (
                        <div key={seg}
                          className={`h-1.5 flex-1 rounded-full transition-all ${seg <= strength ? STRENGTH_COLORS[strength] : "bg-slate-100"}`}
                        />
                      ))}
                    </div>
                    <p className={`mt-1 text-xs ${strength <= 1 ? "text-red-500" : strength <= 2 ? "text-orange-500" : strength === 3 ? "text-yellow-600" : "text-green-600"}`}>
                      {STRENGTH_LABELS[strength]}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="reg-confirm" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Confirm Password
                </label>
                <div className="relative">
                  <input id="reg-confirm" type={showConfirm ? "text" : "password"}
                    value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)}
                    placeholder="Re-enter your password" autoComplete="new-password" required
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-11 text-slate-900 outline-none ring-blue-500 transition focus:ring-2"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900">Business details</h2>
                <p className="mt-1 text-sm text-slate-500">Step 2 of 3 — Tell us about your business</p>
              </div>
              <Field label="Trade Name" id="reg-trade" value={form.tradeName}
                onChange={(v) => set("tradeName", v)} placeholder="Your company name" autoComplete="organization" />
              <Field label="Phone Number" id="reg-phone" type="tel" value={form.phone}
                onChange={(v) => set("phone", v)} placeholder="+263 77 123 4567" autoComplete="tel" />
              <div>
                <label htmlFor="reg-address" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Address
                </label>
                <textarea id="reg-address" value={form.address} onChange={(e) => set("address", e.target.value)}
                  rows={3} placeholder="Business address" required
                  className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none ring-blue-500 transition focus:ring-2"
                />
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900">Tax &amp; compliance details</h2>
                <p className="mt-1 text-sm text-slate-500">Step 3 of 3 — Required for invoice generation</p>
              </div>
              <Field label="TIN Number" id="reg-tin" value={form.tinNumber}
                onChange={(v) => set("tinNumber", v)} placeholder="Tax Identification Number" />
              <Field label="VAT Number" id="reg-vat" value={form.vatNumber}
                onChange={(v) => set("vatNumber", v)} placeholder="VAT registration number" />
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                These details will appear on all invoices generated for your account.
              </div>
            </div>
          )}

          {/* Inline error */}
          {stepError && (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {stepError}
            </div>
          )}

          {/* Buttons */}
          <div className={`mt-6 flex ${step > 1 ? "gap-3" : ""}`}>
            {step > 1 && (
              <button type="button" onClick={handleBack}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Back
              </button>
            )}
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60">
              {step === 3 ? (loading ? "Creating account…" : "Create Account") : "Continue"}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
