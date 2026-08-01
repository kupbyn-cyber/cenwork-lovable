import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, TableCellStack, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { useOrgAccess } from "@/hooks/use-org-access";
import { formatHanoiDateTime } from "@/lib/datetime";
import { REPORT_KIND_LABEL } from "@/lib/report-obligation-data";
import {
  reportArchiveQuery,
  restoreReport,
  setReportArchived,
  softDeleteReport,
  type ReportArchiveRow,
} from "@/lib/report-stats-data";

/**
 * CEN 1.0 — REPORT-03: lưu trữ, xóa mềm và phục hồi báo cáo.
 * Quyền thật do database function kiểm tra (xóa mềm và phục hồi chỉ dành cho CMO);
 * UI chỉ ẩn/hiện nút cho gọn và luôn bắt buộc nhập lý do để ghi Audit Log.
 */
type ActionKind = "unarchive" | "delete" | "restore";

const ACTION_LABEL: Record<ActionKind, string> = {
  unarchive: "Bỏ lưu trữ",
  delete: "Xóa mềm báo cáo",
  restore: "Phục hồi báo cáo",
};

export function ReportArchivePanel() {
  const access = useOrgAccess();
  const queryClient = useQueryClient();
  const archive = useQuery(reportArchiveQuery());

  const [target, setTarget] = React.useState<{ row: ReportArchiveRow; kind: ActionKind } | null>(null);
  const [reason, setReason] = React.useState("");

  const canDelete = access.isCmo || access.isSystemAdmin;

  const mutation = useMutation({
    mutationFn: async (input: { row: ReportArchiveRow; kind: ActionKind; reason: string }) => {
      if (input.kind === "unarchive") await setReportArchived(input.row.id, false, input.reason);
      else if (input.kind === "delete") await softDeleteReport(input.row.id, input.reason);
      else await restoreReport(input.row.id, input.reason);
    },
    onSuccess: (_data, input) => {
      toast.success(`${ACTION_LABEL[input.kind]} thành công`);
      setTarget(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["report-archive"] });
      void queryClient.invalidateQueries({ queryKey: ["report-docs"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (archive.isLoading) return <SkeletonCard lines={5} />;
  if (archive.isError)
    return <ErrorState title="Không tải được danh sách lưu trữ" onRetry={() => void archive.refetch()} />;

  const rows = archive.data ?? [];
  const archived = rows.filter((row) => row.archived_at && !row.deleted_at);
  const deleted = rows.filter((row) => row.deleted_at);

  const buildColumns = (mode: "archived" | "deleted"): DataTableColumn<ReportArchiveRow>[] => [
    {
      id: "period",
      header: "Báo cáo",
      cell: (row) => (
        <TableCellStack
          primary={`${REPORT_KIND_LABEL[row.report_type]} — ${row.period_key}`}
          secondary={row.projectName ?? row.teamName ?? undefined}
        />
      ),
    },
    { id: "author", header: "Người gửi", width: 150, cell: (row) => row.authorName ?? "—" },
    {
      id: "at",
      header: mode === "archived" ? "Lưu trữ lúc" : "Xóa lúc",
      width: 160,
      cell: (row) =>
        formatHanoiDateTime((mode === "archived" ? row.archived_at : row.deleted_at) ?? row.updated_at),
    },
    {
      id: "reason",
      header: "Lý do",
      cell: (row) => (
        <span className="line-clamp-2 text-text-secondary">
          {(mode === "archived" ? row.archive_reason : row.delete_reason) ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: 190,
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {mode === "archived" ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setTarget({ row, kind: "unarchive" })}>
                <Archive className="size-icon-sm" /> Bỏ lưu trữ
              </Button>
              {canDelete ? (
                <Button size="sm" variant="ghost" onClick={() => setTarget({ row, kind: "delete" })}>
                  <Trash2 className="size-icon-sm" /> Xóa
                </Button>
              ) : null}
            </>
          ) : canDelete ? (
            <Button size="sm" variant="ghost" onClick={() => setTarget({ row, kind: "restore" })}>
              <RotateCcw className="size-icon-sm" /> Phục hồi
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const renderList = (mode: "archived" | "deleted", data: ReportArchiveRow[]) =>
    data.length === 0 ? (
      <EmptyState
        variant="compact"
        title={mode === "archived" ? "Chưa có báo cáo lưu trữ" : "Chưa có báo cáo bị xóa"}
      />
    ) : (
      <>
        <div className="hidden md:block">
          <DataTable data={data} columns={buildColumns(mode)} rowKey={(row) => row.id} density="compact" />
        </div>
        <div className="space-y-2 md:hidden">
          {data.map((row) => (
            <div key={row.id} className="space-y-2 rounded-control border border-border-default p-3">
              <p className="font-medium">
                {REPORT_KIND_LABEL[row.report_type]} — {row.period_key}
              </p>
              <p className="text-sm text-text-secondary">{row.authorName ?? "—"}</p>
              <p className="text-xs text-text-muted">
                {(mode === "archived" ? row.archive_reason : row.delete_reason) ?? "Không có lý do"}
              </p>
              <div className="flex flex-wrap gap-2">
                {mode === "archived" ? (
                  <Button size="sm" variant="secondary" onClick={() => setTarget({ row, kind: "unarchive" })}>
                    Bỏ lưu trữ
                  </Button>
                ) : null}
                {mode === "archived" && canDelete ? (
                  <Button size="sm" variant="ghost" onClick={() => setTarget({ row, kind: "delete" })}>
                    Xóa mềm
                  </Button>
                ) : null}
                {mode === "deleted" && canDelete ? (
                  <Button size="sm" variant="secondary" onClick={() => setTarget({ row, kind: "restore" })}>
                    Phục hồi
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lưu trữ báo cáo</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="archived">
          <TabsList>
            <TabsTrigger value="archived">Đã lưu trữ ({archived.length})</TabsTrigger>
            <TabsTrigger value="deleted">Đã xóa ({deleted.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="archived" className="mt-4">
            {renderList("archived", archived)}
          </TabsContent>
          <TabsContent value="deleted" className="mt-4">
            {renderList("deleted", deleted)}
          </TabsContent>
        </Tabs>
      </CardContent>

      <Modal
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            setReason("");
          }
        }}
        title={target ? ACTION_LABEL[target.kind] : ""}
        description="Nhập lý do để ghi vào Audit Log."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Hủy
            </Button>
            <Button
              disabled={reason.trim().length < 3 || mutation.isPending}
              onClick={() => {
                if (!target) return;
                mutation.mutate({ row: target.row, kind: target.kind, reason: reason.trim() });
              }}
            >
              Xác nhận
            </Button>
          </div>
        }
      >
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Lý do (bắt buộc)"
          rows={4}
        />
      </Modal>
    </Card>
  );
}
