"use client";

import { useState, useRef } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function KeywordEditor({ values, onChange, placeholder = "Add..." }: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addValue = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setInput("");
  };

  const removeValue = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addValue(input);
    } else if (e.key === "Backspace" && input === "" && values.length > 0) {
      removeValue(values.length - 1);
    }
  };

  return (
    <div
      className="flex min-h-[32px] flex-1 flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-surface-2 px-2 py-1.5 transition-colors focus-within:border-arc/60"
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-3 px-2 py-0.5 text-xs text-fg-secondary"
        >
          {v}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeValue(i); }}
            className="ml-0.5 rounded-sm p-0.5 text-fg-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addValue(input); }}
        placeholder={values.length === 0 ? placeholder : ""}
        className="min-w-[80px] flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-muted"
      />
    </div>
  );
}
