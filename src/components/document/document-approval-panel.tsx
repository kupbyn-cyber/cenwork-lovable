import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  canDecideDocument,
  canReassignApprover,
  canSubmitDocument,
  canWithdrawDocument,
  isPendingApproval,
  needsSelfApprovalReason,
  type DocumentAccessContext,
  type DocumentRow,
} from "@/lib/document-data";
import { formatDate } from "@/lib/document-view";

export interface PersonOption {
  id: string;
  display_name: string;
}

export interface DocumentApprovalPanelProps {
  document: DocumentRow;
  ctx: DocumentAccessContext;
  people: PersonOption[];
  pending: "submit" | "withdraw" | "approve" | "reject" | "reassign" | null;
  onSubmit: () => void;
  onWithdraw: () => void;
  onApprove: (selfReason: string | null) => void;
  onReject: (reason: string) => void;
  onReassign: (approverId: string) => void;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * DOC-04 — Khối duyệt tài liệu.
 * Chỉ hiển thị/khóa nút theo quyền mirror RLS; database vẫn là chốt cuối.
 */
export function DocumentApprovalPanel({
  document: doc,
  ctx,
  people,
  pending,
  onSubmit,
  onWithdraw,
  onApprove,
  onReject,
  onReassign,
}: DocumentApprovalPanelProps) {
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [selfReason, setSelfReason] = React.useState("");
  const [reassignOpen, setReassignOpen] = React.useState(false);
  const [newApprover, setNewApprover] = React.useState("");

  const version = doc.latestVersion;
  if (!version) return null;

  const submittable = canSubmitDocument(doc, ctx);
  const withdrawable = canWithdrawDocument(doc, ctx);
  const decidable = canDecideDocument(doc, ctx);
  const reassignable = canReassignApprover(doc, ctx);
  const selfApproval = needsSelfApprovalReason(doc, ctx);
  const pendingState = isPendingApproval(doc);
  const busy = pending !== null;

  const candidates = people.filter(
    (p) => p.id !== doc.created_by && p.id !== version.submitted_by,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Duyệt tài liệu</CardTitle>
        {pendingState ? (
          <Badge variant="outline" className="font-normal">
            Chờ duyệt
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0">
            <p className="text-caption text-text-muted">Người duyệt</p>
            <p className="mt-0.5 break-words text-body text-text-primary">
              {doc.approverName ?? "—"}
              {version.alt_approver_id ? " (thay thế)" : ""}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-caption text-text-muted">Người gửi duyệt</p>
            <p className="mt-0.5 break-words text-body text-text-primary">
              {doc.submitterName ?? "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-caption text-text-muted">Thời điểm gửi duyệt</p>
            <p className="mt-0.5 text-body text-text-primary">{dateTime(version.submitted_at)}</p>
          </div>
          {version.approved_at ? (
            <div className="min-w-0">
              <p className="text-caption text-text-muted">Đã duyệt</p>
              <p className="mt-0.5 break-words text-body text-text-primary">
                {doc.approvedByName ?? "—"} — {dateTime(version.approved_at)}
              </p>
            </div>
          ) : null}
          {version.rejected_at ? (
            <div className="min-w-0 sm:col-span-2">
              <p className="text-caption text-text-muted">Bị từ chối</p>
              <p className="mt-0.5 break-words text-body text-text-primary">
                {doc.rejectedByName ?? "—"} — {dateTime(version.rejected_at)}
              </p>
              <p className="mt-0.5 break-words text-body text-state-danger">
                Lý do: {version.reject_reason}
              </p>
            </div>
          ) : null}
          {version.withdrawn_at ? (
            <div className="min-w-0">
              <p className="text-caption text-text-muted">Đã thu hồi</p>
              <p className="mt-0.5 text-body text-text-primary">{dateTime(version.withdrawn_at)}</p>
            </div>
          ) : null}
          {version.self_approved ? (
            <div className="min-w-0 sm:col-span-2">
              <p className="text-caption text-text-muted">Tự duyệt ngoại lệ</p>
              <p className="mt-0.5 break-words text-body text-text-primary">
                {version.self_approval_reason}
              </p>
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="text-caption text-text-muted">Hiệu lực từ</p>
            <p className="mt-0.5 text-body text-text-primary">
              {formatDate(version.effective_from)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {submittable ? (
            <Button loading={pending === "submit"} disabled={busy} onClick={onSubmit}>
              Gửi duyệt
            </Button>
          ) : null}
          {withdrawable ? (
            <Button
              variant="secondary"
              loading={pending === "withdraw"}
              disabled={busy}
              onClick={onWithdraw}
            >
              Thu hồi
            </Button>
          ) : null}
          {decidable ? (
            <>
              <Button
                loading={pending === "approve"}
                disabled={busy}
                onClick={() => {
                  setSelfReason("");
                  if (selfApproval) setApproveOpen(true);
                  else onApprove(null);
                }}
              >
                Duyệt
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  setRejectReason("");
                  setRejectOpen(true);
                }}
              >
                Từ chối
              </Button>
            </>
          ) : null}
          {reassignable ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setNewApprover("");
                setReassignOpen(true);
              }}
            >
              Đổi người duyệt
            </Button>
          ) : null}
          {!submittable && !withdrawable && !decidable && !reassignable ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-body text-text-muted">Không có thao tác duyệt khả dụng.</span>
              </TooltipTrigger>
              <TooltipContent>
                Chỉ người quản lý tài liệu gửi duyệt, và chỉ người duyệt được chỉ định mới
                duyệt/từ chối.
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </CardContent>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        tone="destructive"
        title="Từ chối tài liệu?"
        description="Tài liệu sẽ quay lại trạng thái nháp để người gửi chỉnh sửa."
        confirmLabel="Từ chối"
        loading={pending === "reject"}
        confirmDisabled={rejectReason.trim().length < 5}
        onConfirm={() => {
          onReject(rejectReason);
          setRejectOpen(false);
        }}
      >
        <label className="text-caption text-text-muted" htmlFor="doc-reject-reason">
          Lý do từ chối (bắt buộc, tối thiểu 5 ký tự)
        </label>
        <Textarea
          id="doc-reject-reason"
          className="mt-1"
          rows={3}
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder="Nêu rõ điểm cần chỉnh sửa"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Tự duyệt ngoại lệ?"
        description="Bạn là người tạo hoặc người gửi duyệt tài liệu này. Chỉ thực hiện khi không còn người duyệt hợp lệ khác."
        confirmLabel="Duyệt ngoại lệ"
        loading={pending === "approve"}
        confirmDisabled={selfReason.trim().length < 5}
        onConfirm={() => {
          onApprove(selfReason);
          setApproveOpen(false);
        }}
      >
        <label className="text-caption text-text-muted" htmlFor="doc-self-reason">
          Lý do tự duyệt (bắt buộc, tối thiểu 5 ký tự)
        </label>
        <Textarea
          id="doc-self-reason"
          className="mt-1"
          rows={3}
          value={selfReason}
          onChange={(event) => setSelfReason(event.target.value)}
          placeholder="Ví dụ: Team chưa có Leader, cần ban hành gấp"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        title="Chỉ định người duyệt thay thế"
        description="Áp dụng khi người duyệt mặc định vắng mặt hoặc không còn phù hợp."
        confirmLabel="Chỉ định"
        loading={pending === "reassign"}
        confirmDisabled={!newApprover}
        onConfirm={() => {
          if (newApprover) onReassign(newApprover);
          setReassignOpen(false);
        }}
      >
        <label className="text-caption text-text-muted" htmlFor="doc-new-approver">
          Người duyệt thay thế
        </label>
        <Select value={newApprover} onValueChange={setNewApprover}>
          <SelectTrigger id="doc-new-approver" className="mt-1">
            <SelectValue placeholder="Chọn người duyệt" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfirmDialog>
    </Card>
  );
}
