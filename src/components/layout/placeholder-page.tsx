import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/**
 * CEN 1.0 — Placeholder chung cho route chưa triển khai (M1.2).
 * Không chứa dữ liệu hoặc nghiệp vụ giả.
 */
export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={title} {...(description ? { description } : {})} />
      <EmptyState
        title="Chức năng chưa được triển khai"
        description="Màn hình này sẽ được xây dựng ở các gói tiếp theo."
      />
    </div>
  );
}
