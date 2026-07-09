"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-20 text-center">
      <div className="anim-fade-up">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-warn/40 bg-warn/10 text-warn">
          <TriangleAlert size={24} />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-fg">
          Something slipped out of tolerance.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg-secondary">
          An unexpected error occurred while rendering this page. It&apos;s been logged — try
          again, and if it persists, let us know.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-fg-muted">ref: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>
            <RotateCcw size={15} /> Try again
          </Button>
          <ButtonLink href="/contact" variant="secondary">
            Report the issue
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
