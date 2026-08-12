import { Bell, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * NAP-UI-11 — Nút tạo mới theo ngữ cảnh tab:
 * - Thông báo → "Tạo thông báo"
 * - Đề xuất → "Tạo đề xuất" (vẫn mở ApprovalFormDrawer, không đổi nghiệp vụ)
 * - Phê duyệt → không có nút tạo
 * Component chỉ phát callback, không chứa nghiệp vụ.
 */
export type ModuleCreateContext = "announcement" | "proposal" | "approval";

interface Props {
  context: ModuleCreateContext;
  canCreate: boolean;
  onCreate: () => void;
}

export function ModuleCreateActions({ context, canCreate, onCreate }: Props) {
  if (context === "approval" || !canCreate) return null;

  const isAnnouncement = context === "announcement";

  return (
    <Button type="button" className="w-full sm:w-auto" onClick={onCreate}>
      {isAnnouncement ? <Bell /> : <ClipboardCheck />}
      {isAnnouncement ? "Tạo thông báo" : "Tạo đề xuất"}
    </Button>
  );
}
