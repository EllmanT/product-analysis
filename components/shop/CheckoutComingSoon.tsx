import Link from "next/link";
import { Clock } from "lucide-react";

export function CheckoutComingSoon({
  message = "Checkout is coming soon. Thanks for your patience — your cart is saved.",
  backHref = "/cart",
  backLabel = "Back to cart",
}: {
  message?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Clock className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">
        Checkout isn&apos;t open yet
      </h1>
      <p className="text-sm text-slate-600">{message}</p>
      <Link
        href={backHref}
        className="mt-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        {backLabel}
      </Link>
    </div>
  );
}
