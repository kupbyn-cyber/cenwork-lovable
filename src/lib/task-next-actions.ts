import {
  canApproveTaskSubmission,
  canChangeTaskStatus,
  canEditTask,
  canResubmitTask,
  isTaskAssignee,
  isTaskCancelled,
  isTaskOverdue,
  isTaskSubmissionAuthor,
  type TaskAccessContext,
  type TaskRow,
} from "@/lib/task-data";

/**
 * CEN 1.0 — TASK-DETAIL-UX-01.
 * Suy ra danh sách "Tôi cần làm gì" từ trạng thái thật của Task và quyền của người xem.
 * Chỉ trình bày: không đổi Business Rule, không gọi dữ liệu, không quyết định quyền backend.
 */
export type NextActionKind = "action" | "waiting";

export interface TaskNextAction {
  key: string;
  label: string;
  hint?: string;
  kind: NextActionKind;
  /** Nội dung cần chú ý cao (quá hạn, yêu cầu chỉnh sửa). */
  urgent?: boolean;
}

export interface TaskNextActionInput {
  task: TaskRow;
  ctx: TaskAccessContext;
  /** Có yêu cầu đổi deadline đang chờ xử lý hay không. */
  pendingDeadlineRequest?: boolean;
  /** Người xem có quyền duyệt yêu cầu đổi deadline. */
  canApproveDeadline?: boolean;
  /** Tác giả bình luận mới nhất (null khi chưa có bình luận). */
  lastCommentAuthorId?: string | null;
}

export function taskNextActions({
  task,
  ctx,
  pendingDeadlineRequest = false,
  canApproveDeadline = false,
  lastCommentAuthorId = null,
}: TaskNextActionInput): TaskNextAction[] {
  if (isTaskCancelled(task)) return [];

  const list: TaskNextAction[] = [];
  const involved =
    isTaskAssignee(task, ctx) ||
    Boolean(ctx.userId && task.participantIds.includes(ctx.userId)) ||
    isTaskSubmissionAuthor(task, ctx);

  /* --- Vòng duyệt Task --- */
  if (task.approval_status !== "approved") {
    if (canApproveTaskSubmission(task, ctx)) {
      list.push({
        key: "approve-submission",
        label: "Phê duyệt công việc",
        hint: "Công việc đang chờ bạn duyệt trước khi triển khai.",
        kind: "action",
        urgent: true,
      });
    } else if (canResubmitTask(task, ctx)) {
      list.push({
        key: "resubmit",
        label: "Chỉnh sửa và gửi duyệt lại",
        hint: task.approval_note ?? "Người duyệt đã yêu cầu chỉnh sửa nội dung.",
        kind: "action",
        urgent: true,
      });
    } else if (task.approval_status === "pending") {
      list.push({
        key: "await-approval",
        label: "Chờ phê duyệt",
        hint: "Công việc đã gửi duyệt, chờ người có thẩm quyền xử lý.",
        kind: "waiting",
      });
    } else if (task.approval_status === "withdrawn") {
      list.push({
        key: "withdrawn",
        label: "Đã thu hồi — cần gửi duyệt lại",
        kind: "waiting",
      });
    }
  }

  /* --- Vòng đời thực hiện --- */
  const canRun = canChangeTaskStatus(task, ctx);
  if (task.approval_status === "approved" && !task.is_archived) {
    if (task.status === "not_started" && canRun) {
      list.push({
        key: "start",
        label: "Bắt đầu thực hiện",
        hint: "Chuyển trạng thái sang Đang thực hiện khi bắt tay vào việc.",
        kind: "action",
      });
    }
    if (task.status === "in_progress" && canRun) {
      list.push({
        key: "progress",
        label: "Cập nhật tiến độ",
        hint: "Đổi trạng thái hoặc ghi nhận phần việc đã xong.",
        kind: "action",
      });
    }
    if (
      (task.status === "in_progress" || task.status === "review") &&
      !task.result_text &&
      canEditTask(task, ctx)
    ) {
      list.push({
        key: "result",
        label: "Ghi kết quả công việc",
        hint: "Bổ sung mô tả kết quả kèm link/tệp minh chứng khi hoàn thành.",
        kind: "action",
      });
    }
    if (task.status === "review") {
      if (canApproveDeadline || canRun) {
        list.push({
          key: "review",
          label: "Kiểm tra kết quả",
          hint: "Công việc đã chuyển sang bước kiểm tra.",
          kind: canApproveDeadline ? "action" : "waiting",
        });
      } else {
        list.push({ key: "review-wait", label: "Chờ kiểm tra", kind: "waiting" });
      }
    }
  }

  /* --- Deadline --- */
  if (pendingDeadlineRequest) {
    list.push(
      canApproveDeadline
        ? {
            key: "deadline-approve",
            label: "Duyệt yêu cầu đổi deadline",
            hint: "Có đề xuất đổi hạn đang chờ quyết định.",
            kind: "action",
            urgent: true,
          }
        : {
            key: "deadline-wait",
            label: "Chờ duyệt đổi deadline",
            kind: "waiting",
          },
    );
  } else if (isTaskOverdue(task) && (canRun || involved)) {
    list.push({
      key: "overdue",
      label: "Xử lý công việc quá hạn",
      hint: "Cập nhật tiến độ hoặc gửi yêu cầu đổi deadline.",
      kind: "action",
      urgent: true,
    });
  }

  /* --- Bình luận --- */
  if (
    lastCommentAuthorId &&
    ctx.userId &&
    lastCommentAuthorId !== ctx.userId &&
    (involved || canRun)
  ) {
    list.push({
      key: "comment",
      label: "Bình luận phản hồi",
      hint: "Có trao đổi mới trong công việc này.",
      kind: "action",
    });
  }

  return list;
}
