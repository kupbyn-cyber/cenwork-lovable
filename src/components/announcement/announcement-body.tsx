import * as React from "react";

/**
 * CEN 1.0 — M6.1 hiển thị nội dung thông báo dạng văn bản thuần.
 * URL được nhận diện và mở tab mới; không hỗ trợ HTML, Markdown hay nội dung nhúng.
 */
const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/g;
const IS_URL = /^https?:\/\//;

export function AnnouncementBody({ body }: { body: string }) {
  const parts = React.useMemo(() => body.split(URL_SPLIT), [body]);

  return (
    <div className="min-w-0 whitespace-pre-wrap break-words text-body text-text-secondary">
      {parts.map((part, index) =>
        IS_URL.test(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-primary underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={`text-${index}`}>{part}</React.Fragment>
        ),
      )}
    </div>
  );
}
