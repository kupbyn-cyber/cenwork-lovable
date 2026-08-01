import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, MoreHorizontal, Pencil, RefreshCw, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";
import { cenToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  createSavedView,
  deleteSavedView,
  renameSavedView,
  setSavedViewDefault,
  updateSavedViewConfig,
  type SavedView,
  type SavedViewConfig,
} from "@/lib/task-view-data";

/**
 * CEN 1.0 — Chế độ xem cá nhân của trang Công việc.
 * Chỉ lưu cấu hình hiển thị; RLS đảm bảo mỗi người chỉ thấy chế độ xem của mình.
 */
export interface TaskSavedViewsProps {
  userId: string | null;
  views: SavedView[];
  activeViewId: string | null;
  onSelect: (viewId: string | null) => void;
  currentConfig: SavedViewConfig;
}

export function TaskSavedViews({
  userId,
  views,
  activeViewId,
  onSelect,
  currentConfig,
}: TaskSavedViewsProps) {
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [makeDefault, setMakeDefault] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<SavedView | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<SavedView | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["task-saved-views"] });

  const saveMutation = useMutation({
    mutationFn: () => createSavedView(userId!, name, currentConfig, makeDefault),
    onSuccess: () => {
      void refresh();
      setSaveOpen(false);
      setName("");
      setMakeDefault(false);
      cenToast.success("Đã lưu chế độ xem.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (view: SavedView) => updateSavedViewConfig(view.id, currentConfig),
    onSuccess: () => {
      void refresh();
      cenToast.success("Đã cập nhật chế độ xem theo cấu hình hiện tại.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const renameMutation = useMutation({
    mutationFn: () => renameSavedView(renameTarget!.id, renameValue),
    onSuccess: () => {
      void refresh();
      setRenameTarget(null);
      cenToast.success("Đã đổi tên chế độ xem.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const defaultMutation = useMutation({
    mutationFn: (view: SavedView) => setSavedViewDefault(view.id, !view.isDefault),
    onSuccess: () => {
      void refresh();
      cenToast.success("Đã cập nhật chế độ xem mặc định.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSavedView(deleteTarget!.id),
    onSuccess: () => {
      void refresh();
      if (deleteTarget && deleteTarget.id === activeViewId) onSelect(null);
      setDeleteTarget(null);
      cenToast.success("Đã xóa chế độ xem.");
    },
    onError: (error: Error) => cenToast.error(error.message),
  });

  const chipClass = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-body-sm transition-colors",
      active
        ? "border-transparent bg-surface-raised text-text-primary"
        : "border-border-subtle text-text-secondary hover:text-text-primary",
    );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button type="button" className={chipClass(activeViewId === null)} onClick={() => onSelect(null)}>
        Mặc định
      </button>

      {views.map((view) => (
        <div key={view.id} className="flex items-center">
          <button
            type="button"
            className={cn(chipClass(activeViewId === view.id), "rounded-r-none pr-2")}
            onClick={() => onSelect(view.id)}
          >
            {view.isDefault ? <Star className="size-3.5 text-state-warning" /> : null}
            <span className="max-w-[160px] truncate">{view.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Tùy chọn chế độ xem ${view.name}`}
                className={cn(chipClass(activeViewId === view.id), "rounded-l-none border-l-0 px-2")}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => updateMutation.mutate(view)}>
                <RefreshCw />
                Cập nhật theo cấu hình hiện tại
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setRenameTarget(view);
                  setRenameValue(view.name);
                }}
              >
                <Pencil />
                Đổi tên
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => defaultMutation.mutate(view)}>
                {view.isDefault ? <Check /> : <Star />}
                {view.isDefault ? "Bỏ đặt làm mặc định" : "Đặt làm mặc định"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(view)}>
                <Trash2 />
                Xóa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}

      {userId ? (
        <Button variant="ghost" size="sm" onClick={() => setSaveOpen(true)}>
          <Bookmark />
          Lưu chế độ xem
        </Button>
      ) : null}

      <Modal
        open={saveOpen}
        onOpenChange={(open) => {
          if (!saveMutation.isPending) setSaveOpen(open);
        }}
        title="Lưu chế độ xem"
        description="Lưu bộ lọc, cách sắp xếp và cột hiển thị hiện tại thành chế độ xem riêng của bạn."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saveMutation.isPending}>
              Hủy
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={name.trim() === "" || saveMutation.isPending}
              loading={saveMutation.isPending}
            >
              Lưu
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="saved-view-name">Tên chế độ xem</Label>
            <Input
              id="saved-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ví dụ: Việc của tôi"
              maxLength={80}
            />
          </div>
          <label className="flex items-center gap-2 text-body-sm text-text-secondary">
            <Checkbox
              checked={makeDefault}
              onCheckedChange={(value) => setMakeDefault(value === true)}
            />
            Đặt làm chế độ xem mặc định
          </label>
        </div>
      </Modal>

      <Modal
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !renameMutation.isPending) setRenameTarget(null);
        }}
        title="Đổi tên chế độ xem"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={renameMutation.isPending}
            >
              Hủy
            </Button>
            <Button
              onClick={() => renameMutation.mutate()}
              disabled={renameValue.trim() === "" || renameMutation.isPending}
              loading={renameMutation.isPending}
            >
              Lưu
            </Button>
          </div>
        }
      >
        <div className="p-4">
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            aria-label="Tên chế độ xem"
            maxLength={80}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
        tone="destructive"
        title="Xóa chế độ xem?"
        description={`Chế độ xem "${deleteTarget?.name ?? ""}" sẽ bị xóa. Dữ liệu công việc không thay đổi.`}
        confirmLabel="Xóa"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
