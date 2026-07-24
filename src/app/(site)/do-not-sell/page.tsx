import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { RemovalForm } from "@/components/removal-form";

export const metadata: Metadata = {
  title: "Do Not Sell / Remove My Info",
  description:
    "Request removal, correction, or opt-out of sale/sharing of your information on AVLpoint.",
};

export default function DoNotSellPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="anim-fade-up mb-10 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-arc/25 bg-arc/10 text-arc">
          <ShieldCheck size={22} />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Your data, your call.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-fg-secondary">
          Use this form to request removal of your information, correct a record, or opt out of
          the sale or sharing of your personal information (CCPA), or to exercise your GDPR
          rights. No account required.
        </p>
      </div>

      <div className="card anim-fade-up delay-2 p-6 sm:p-8">
        <RemovalForm />
      </div>

      <p className="mt-6 text-center text-xs text-fg-muted">
        Details on how we handle data are in the{" "}
        <Link href="/privacy" className="text-arc hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
