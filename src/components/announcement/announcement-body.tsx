import { LinkifiedText } from "@/components/ui/linkified-text";

/**
 * CEN 1.0 — M6.1 hiển thị nội dung thông báo dạng văn bản thuần.
 * URL được nhận diện và mở tab mới; không hỗ trợ HTML, Markdown hay nội dung nhúng.
 */
export function AnnouncementBody({ body }: { body: string }) {
  return <LinkifiedText as="div" className="text-body text-text-secondary" text={body} />;
}
