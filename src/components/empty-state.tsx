import { SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "./ui";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-fg-muted">
        {icon ?? <SearchX size={24} />}
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold text-fg">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-fg-secondary">
          {description}
        </p>
      </div>
      {action && (
        <ButtonLink href={action.href} variant="secondary" size="sm">
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}
