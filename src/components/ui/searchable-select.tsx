import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Select đơn có ô tìm kiếm thông minh.
 * Tìm kiếm bỏ dấu tiếng Việt, không phân biệt hoa/thường, khớp theo từ khóa rời.
 */
export interface SearchableOption {
  value: string;
  label: string;
  /** Dòng phụ hiển thị dưới nhãn (vai trò, team…). */
  hint?: string;
  disabled?: boolean;
}

/** Bỏ dấu tiếng Việt để so khớp gần đúng. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

export function matchesQuery(text: string, query: string): boolean {
  const haystack = normalizeSearch(text);
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

export interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Tìm nhanh…",
  emptyText = "Không tìm thấy kết quả phù hợp.",
  ariaLabel,
  disabled,
  id,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = query
    ? options.filter((option) => matchesQuery(`${option.label} ${option.hint ?? ""}`, query))
    : options;

  return (
    <Popover open={open} onOpenChange={disabled ? () => undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn(
            "h-10 w-full min-w-0 justify-between font-normal",
            !selected && "text-text-tertiary",
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-60 p-2">
        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 pl-8"
          />
        </div>
        <div role="listbox" className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-body-sm text-text-tertiary">{emptyText}</p>
          ) : (
            filtered.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-body-sm hover:bg-surface-raised",
                    option.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                  )}
                >
                  <Check
                    className={cn("mt-0.5 size-4 shrink-0", active ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="min-w-0 break-words">{option.label}</span>
                    {option.hint ? (
                      <span className="text-caption text-text-muted">{option.hint}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
