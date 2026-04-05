"use client";

import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useRef, useState, useEffect, KeyboardEvent, ClipboardEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Step = "otp" | "password" | "success";

interface ShopForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Email already entered in the login form */
  email: string;
}

export default function ShopForgotPasswordModal({ open, onClose, email }: ShopForgotPasswordModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("otp");

  // OTP step
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Password step
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-send OTP as soon as the modal opens
  useEffect(() => {
    if (open && email) {
      sendOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetAll() {
    setStep("otp");
    setOtp(Array(6).fill(""));
    setPassword("");
    setConfirm("");
    setError("");
    setLoading(false);
    setShowPassword(false);
    setShowConfirm(false);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  // ── Send OTP ─────────────────────────────────────────────────────────────
  async function sendOtp() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/shop/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ── OTP input handling ────────────────────────────────────────────────────
  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const next = [...otp];
        next[index] = "";
        setOtp(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill("");
    pasted.split("").forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    const lastFilled = Math.min(pasted.length, 5);
    otpRefs.current[lastFilled]?.focus();
  }

  // ── Step 2: verify OTP ───────────────────────────────────────────────────
  async function handleVerifyOtp() {
    setError("");
    const code = otp.join("");
    if (code.length !== 6) return setError("Please enter all 6 digits.");

    setLoading(true);
    try {
      const res = await fetch("/api/shop/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setStep("password");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: reset password and auto-login ────────────────────────────────
  async function handleResetPassword() {
    setError("");
    if (!password) return setError("Please enter a new password.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const res = await fetch("/api/shop/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      // Auto sign-in with shop cookie auth
      const loginRes = await fetch("/api/shop/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      setStep("success");
      setTimeout(() => {
        handleClose();
        if (loginRes.ok) {
          router.push("/");
          router.refresh();
        }
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────────────────
  async function handleResend() {
    setOtp(Array(6).fill(""));
    await sendOtp();
  }

  const otpComplete = otp.every((d) => d !== "");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[420px]">

        {/* ── Success ── */}
        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <ShieldCheck className="h-7 w-7 text-green-600" />
            </div>
            <DialogTitle className="text-xl">Password Reset!</DialogTitle>
            <DialogDescription>
              Your password has been updated. Signing you in…
            </DialogDescription>
          </div>
        )}

        {/* ── Step 1: OTP ── */}
        {step === "otp" && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
              </div>
              <DialogTitle>Enter verification code</DialogTitle>
              <DialogDescription>
                We sent a 6-digit code to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                It expires in 10 minutes.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col gap-5">
              <div className="flex items-center justify-between gap-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={handleOtpPaste}
                    className="h-12 w-12 rounded-lg border border-slate-200 bg-white text-center text-xl font-semibold text-slate-900 shadow-sm transition-colors focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                  />
                ))}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={loading || !otpComplete}
                className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Verify code"}
              </button>

              <p className="text-center text-sm text-slate-500">
                Didn&apos;t receive it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="font-medium text-[#2563EB] underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </p>
            </div>
          </>
        )}

        {/* ── Step 2: New password ── */}
        {step === "password" && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                <KeyRound className="h-5 w-5 text-orange-600" />
              </div>
              <DialogTitle>Set a new password</DialogTitle>
              <DialogDescription>
                Choose a strong password. You&apos;ll be signed in automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">New Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-h-11 pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Confirm Password</label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Re-enter your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                    className="min-h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {confirm && (
                <p className={`text-xs ${password === confirm ? "text-green-600" : "text-red-500"}`}>
                  {password === confirm ? "Passwords match" : "Passwords do not match"}
                </p>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="button"
                onClick={handleResetPassword}
                disabled={loading || !password || !confirm}
                className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
              >
                {loading ? "Resetting…" : "Reset password & sign in"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
