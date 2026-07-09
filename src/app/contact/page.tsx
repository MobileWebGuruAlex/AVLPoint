import type { Metadata } from "next";
import { Clock, Mail, MessageSquare } from "lucide-react";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to the AVLpoint team about enterprise access, data, or partnerships.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div className="anim-fade-up">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-arc">Contact</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-fg">
            Let&apos;s talk vendors.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-secondary">
            Enterprise rollouts, API access, profile claims, data corrections — or just a
            question about how the pipeline works. We read everything.
          </p>
          <div className="mt-10 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
                <Mail size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold text-fg">Email</p>
                <a href="mailto:hello@avlpoint.com" className="text-sm text-arc hover:underline">
                  hello@avlpoint.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
                <Clock size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold text-fg">Response time</p>
                <p className="text-sm text-fg-secondary">Within one business day</p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-arc/25 bg-arc/10 text-arc">
                <MessageSquare size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold text-fg">Vendors</p>
                <p className="text-sm text-fg-secondary">
                  In the database? Choose “Claim a vendor profile” and we&apos;ll verify you.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card anim-fade-up delay-2 h-fit p-7">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
