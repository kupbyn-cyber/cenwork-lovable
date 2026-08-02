import * as React from "react";
import { Bell, ClipboardCheck, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerPanel } from "@/components/ui/drawer-panel";

/**
 * NAP-04 — Nút tạo mới dùng chung cho module "Thông báo & Phê duyệt".
 * Desktop/tablet: hai nút riêng. Mobile: một nút "Tạo mới" mở bottom sheet.
 * Component chỉ phát callback, không chứa nghiệp vụ.
 */
interface Props {
  canCreateAnnouncement: boolean;
  canCreateApproval: boolean;
  onCreateAnnouncement: () => void;
  onCreateApproval: () => void;
}

export function ModuleCreateActions({
  canCreateAnnouncement,
  canCreateApproval,
  onCreateAnnouncement,
  onCreateApproval,
}: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  if (!canCreateAnnouncement && !canCreateApproval) return null;

  return (
    <>
      <div className="hidden gap-2 sm:flex">
        {canCreateAnnouncement ? (
          <Button type="button" variant="secondary" onClick={onCreateAnnouncement}>
            <Bell />
            Tạo thông báo
          </Button>
        ) : null}
        {canCreateApproval ? (
          <Button type="button" onClick={onCreateApproval}>
            <ClipboardCheck />
            Tạo phê duyệt
          </Button>
        ) : null}
      </div>

      <div className="flex sm:hidden">
        <Button type="button" className="w-full" onClick={() => setSheetOpen(true)}>
          <Plus />
          Tạo mới
        </Button>
      </div>

      <DrawerPanel
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        side="bottom"
        title="Tạo mới"
        description="Chọn loại nội dung bạn muốn tạo."
      >
        <div className="flex flex-col gap-2">
          {canCreateAnnouncement ? (
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => {
                setSheetOpen(false);
                onCreateAnnouncement();
              }}
            >
              <Bell />
              Tạo thông báo nội bộ
            </Button>
          ) : null}
          {canCreateApproval ? (
            <Button
              type="button"
              className="justify-start"
              onClick={() => {
                setSheetOpen(false);
                onCreateApproval();
              }}
            >
              <ClipboardCheck />
              Tạo yêu cầu phê duyệt
            </Button>
          ) : null}
        </div>
      </DrawerPanel>
    </>
  );
}
