import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="bg-grid bg-radial-fade flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-20 text-center">
      <div className="anim-fade-up">
        <LogoMark size={52} className="mx-auto opacity-70" />
        <p className="mt-8 font-mono text-sm text-arc">404 · waypoint not found</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-fg sm:text-5xl">
          This coordinate doesn&apos;t exist.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-fg-secondary">
          The page may have moved, or the vendor you&apos;re after lives somewhere else in the
          database. The search box always knows the way.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/search">
            <Compass size={15} /> Search vendors
          </ButtonLink>
          <ButtonLink href="/home" variant="secondary">
            Back to home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
