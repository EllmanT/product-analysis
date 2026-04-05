"use client";

import { signIn } from "next-auth/react";
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
import ROUTES from "@/constants/route";

type Step = "email" | "otp" | "password" | "success";

interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Email already entered in the sign-in form */
  email: string;
}

export default function ForgotPasswordModal({ open, onClose, email }: ForgotPasswordModalProps) {
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

  // ── Send OTP (called automatically on open and on resend) ────────────────
  async function sendOtp() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
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
      const res = await fetch("/api/auth/verify-otp", {
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
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      // Auto sign-in then redirect
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        // Password reset worked but auto-login failed – just go to sign-in
        handleClose();
        router.push(ROUTES.SIGN_IN);
        return;
      }

      setStep("success");
      setTimeout(() => {
        handleClose();
        router.push(ROUTES.HOME);
        router.refresh();
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
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <ShieldCheck className="h-7 w-7 text-green-600" />
            </div>
            <DialogTitle className="text-xl">Password Reset!</DialogTitle>
            <DialogDescription>
              Your password has been updated. Redirecting you to the dashboard…
            </DialogDescription>
          </div>
        )}

        {/* ── Step 2: OTP ── */}
        {step === "otp" && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
              </div>
              <DialogTitle>Enter verification code</DialogTitle>
              <DialogDescription>
                We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
                It expires in 10 minutes.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col gap-5">
              {/* 6-box OTP input */}
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
                    className="h-12 w-12 rounded-lg border border-input bg-background text-center text-xl font-semibold text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                ))}
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button
                className="primary-gradient min-h-11 w-full font-inter !text-light-900"
                onClick={handleVerifyOtp}
                disabled={loading || !otpComplete}
              >
                {loading ? "Verifying…" : "Verify code"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Didn&apos;t receive it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </p>
            </div>
          </>
        )}

        {/* ── Step 3: New password ── */}
        {step === "password" && (
          <>
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                <KeyRound className="h-5 w-5 text-orange-600" />
              </div>
              <DialogTitle>Set a new password</DialogTitle>
              <DialogDescription>
                Choose a strong password. You&apos;ll be signed in automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col gap-4">
              {/* New password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-dark400_light700">New Password</label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-dark400_light700">Confirm Password</label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Password match indicator */}
              {confirm && (
                <p className={`text-xs ${password === confirm ? "text-green-600" : "text-red-500"}`}>
                  {password === confirm ? "Passwords match" : "Passwords do not match"}
                </p>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button
                className="primary-gradient min-h-11 w-full font-inter !text-light-900"
                onClick={handleResetPassword}
                disabled={loading || !password || !confirm}
              >
                {loading ? "Resetting…" : "Reset password & sign in"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
