import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesQuery } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Multi-select dạng danh sách checkbox.
 * Dropdown không tự đóng sau mỗi lần chọn; hiển thị gọn số lượng đã chọn.
 * Không chọn giá trị nào nghĩa là không lọc theo trường đó.
 */
export interface MultiSelectOption {
  value: string;
  label: string;
  /** Dữ liệu phụ dùng để tìm kiếm và hiển thị (email, Team, chức danh…). */
  hint?: string | undefined;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Nhãn hiển thị khi chưa chọn giá trị nào. */
  placeholder: string;
  ariaLabel?: string;
  className?: string;
  /** Ô tìm kiếm hiện khi danh sách dài (mặc định từ 6 lựa chọn). */
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  searchable,
  searchPlaceholder = "Tìm nhanh…",
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = React.useMemo(() => new Set(value), [value]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const showSearch = searchable ?? options.length >= 6;
  const filtered = query
    ? options.filter((option) => matchesQuery(`${option.label} ${option.hint ?? ""}`, query))
    : options;

  const toggle = (item: string) => {
    onChange(selected.has(item) ? value.filter((v) => v !== item) : [...value, item]);
  };

  const firstLabel = options.find((option) => option.value === value[0])?.label;
  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (firstLabel ?? placeholder)
        : `${placeholder}: ${value.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "h-10 w-full min-w-0 justify-between font-normal",
            value.length === 0 && "text-text-tertiary",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <span className="flex shrink-0 items-center gap-1">
            {value.length > 0 ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Xóa lọc ${placeholder}`}
                className="rounded-sm p-0.5 text-text-tertiary hover:text-text-primary"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange([]);
                  }
                }}
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronDown className="size-4 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-1">
        {showSearch ? (
          <div className="relative mb-1 p-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
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
        ) : null}
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-body-sm text-text-tertiary">
              {options.length === 0 ? "Không có lựa chọn" : "Không tìm thấy kết quả phù hợp."}
            </p>
          ) : (
            filtered.map((option) => {
              const active = selected.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-body-sm hover:bg-surface-raised"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-default",
                      active && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {active ? <Check className="size-3" /> : null}
                  </span>
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
        {value.length > 0 ? (
          <div className="border-t border-border-subtle pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => onChange([])}
            >
              Bỏ chọn tất cả
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
