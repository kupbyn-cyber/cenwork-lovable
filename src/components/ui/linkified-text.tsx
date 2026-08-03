import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — LINK-01: hiển thị văn bản thuần và tự nhận diện URL thành liên kết an toàn.
 * Không dùng dangerouslySetInnerHTML, không parse HTML người dùng nhập, không đổi dữ liệu gốc.
 */
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
/** Ký tự câu thường đứng sau URL, không thuộc URL. */
const TRAILING = /[.,;:!?)\]}>'"…]+$/;

function splitTrailing(raw: string): [string, string] {
  let url = raw;
  let tail = "";
  for (;;) {
    const match = TRAILING.exec(url);
    if (!match) break;
    // Giữ dấu đóng ngoặc nếu URL có ngoặc mở tương ứng.
    const trimmed = url.slice(0, match.index);
    if (
      (match[0].startsWith(")") && (trimmed.match(/\(/g)?.length ?? 0) > (trimmed.match(/\)/g)?.length ?? 0))
    ) {
      break;
    }
    url = trimmed;
    tail = match[0] + tail;
  }
  return [url, tail];
}

/** Chỉ cho phép http/https; chặn javascript:, data: và giao thức khác. */
function safeHref(url: string): string | null {
  const candidate = /^www\./i.test(url) ? `https://${url}` : url;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export interface LinkifiedTextProps {
  text: string | null | undefined;
  className?: string;
  /** Nội dung thay thế khi rỗng. */
  fallback?: React.ReactNode;
  as?: "div" | "span" | "p";
}

export function LinkifiedText({
  text,
  className,
  fallback = null,
  as: Tag = "span",
}: LinkifiedTextProps) {
  const nodes = React.useMemo(() => {
    if (!text) return null;
    const parts = text.split(URL_PATTERN);
    return parts.map((part, index) => {
      if (index % 2 === 0 || !part) {
        return <React.Fragment key={`t-${index}`}>{part}</React.Fragment>;
      }
      const [raw, tail] = splitTrailing(part);
      const href = safeHref(raw);
      if (!href) return <React.Fragment key={`t-${index}`}>{part}</React.Fragment>;
      return (
        <React.Fragment key={`l-${index}`}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer break-all text-text-primary underline underline-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1"
          >
            {raw}
          </a>
          {tail}
        </React.Fragment>
      );
    });
  }, [text]);

  if (!text) return <>{fallback}</>;

  return (
    <Tag className={cn("min-w-0 whitespace-pre-wrap break-words", className)}>{nodes}</Tag>
  );
}
