import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { ResultVisibility } from "@/lib/announcement-data";

/**
 * CEN 1.0 — M6.2 tương tác thông báo nội bộ (bình luận, khảo sát, phiên bản).
 * Mọi ràng buộc nghiệp vụ quan trọng nằm ở database (RLS + hàm SECURITY DEFINER);
 * lớp này chỉ gọi đúng API và chuẩn hoá dữ liệu cho UI.
 */
function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/* ------------------------------- BÌNH LUẬN ------------------------------- */

export interface CommentRow {
  id: string;
  announcement_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  is_edited: boolean;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
}

export interface MentionRow {
  comment_id: string;
  user_id: string;
}

const COMMENT_COLUMNS =
  "id,announcement_id,parent_id,author_id,body,is_edited,hidden_at,hidden_reason,created_at";

export async function fetchComments(announcementId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from("announcement_comments")
    .select(COMMENT_COLUMNS)
    .eq("announcement_id", announcementId)
    .order("created_at", { ascending: true });
  fail(error);
  return (data ?? []) as CommentRow[];
}

export async function fetchMentions(announcementId: string): Promise<MentionRow[]> {
  const { data, error } = await supabase
    .from("announcement_comment_mentions")
    .select("comment_id,user_id")
    .eq("announcement_id", announcementId);
  fail(error);
  return (data ?? []) as MentionRow[];
}

export const commentsQuery = (announcementId: string) =>
  queryOptions({
    queryKey: ["announcement-comments", announcementId],
    queryFn: () => fetchComments(announcementId),
  });

export const mentionsQuery = (announcementId: string) =>
  queryOptions({
    queryKey: ["announcement-mentions", announcementId],
    queryFn: () => fetchMentions(announcementId),
  });

export async function postComment(input: {
  announcementId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  mentionUserIds: string[];
}) {
  const { data, error } = await supabase
    .from("announcement_comments")
    .insert({
      announcement_id: input.announcementId,
      parent_id: input.parentId,
      author_id: input.authorId,
      body: input.body.trim(),
    })
    .select("id")
    .single();
  fail(error);
  const commentId = (data as { id: string }).id;
  if (input.mentionUserIds.length > 0) {
    const { error: mentionError } = await supabase.from("announcement_comment_mentions").insert(
      input.mentionUserIds.map((user_id) => ({
        comment_id: commentId,
        announcement_id: input.announcementId,
        user_id,
      })),
    );
    // Mention ngoài phạm vi bị RLS từ chối — bình luận vẫn giữ nguyên.
    if (mentionError) throw new Error("Không thể nhắc tên người ngoài phạm vi thông báo.");
  }
  return commentId;
}

export async function editComment(commentId: string, body: string) {
  const { error } = await supabase
    .from("announcement_comments")
    .update({ body: body.trim() })
    .eq("id", commentId);
  fail(error);
}

export async function setCommentHidden(commentId: string, hidden: boolean, reason: string) {
  const { error } = await supabase
    .from("announcement_comments")
    .update(
      hidden
        ? { hidden_at: new Date().toISOString(), hidden_reason: reason.trim() }
        : { hidden_at: null, hidden_reason: null },
    )
    .eq("id", commentId);
  fail(error);
}

/* -------------------------------- KHẢO SÁT ------------------------------- */

export type QuestionType = "single" | "multi" | "short";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: "Một lựa chọn",
  multi: "Nhiều lựa chọn",
  short: "Trả lời ngắn",
};

export interface QuestionRow {
  id: string;
  announcement_id: string;
  version: number;
  position: number;
  question_type: QuestionType;
  content: string;
  is_required: boolean;
  min_select: number | null;
  max_select: number | null;
}

export interface OptionRow {
  id: string;
  question_id: string;
  position: number;
  label: string;
}

export interface AnswerRow {
  id: string;
  question_id: string;
  version: number;
  user_id: string;
  option_ids: string[];
  text_answer: string | null;
  submitted_at: string | null;
}

/** Câu hỏi và phương án của một phiên bản. */
export async function fetchSurvey(announcementId: string, version: number) {
  const [questions, options] = await Promise.all([
    supabase
      .from("announcement_questions")
      .select("id,announcement_id,version,position,question_type,content,is_required,min_select,max_select")
      .eq("announcement_id", announcementId)
      .eq("version", version)
      .order("position", { ascending: true }),
    supabase
      .from("announcement_question_options")
      .select("id,question_id,position,label")
      .eq("announcement_id", announcementId)
      .order("position", { ascending: true }),
  ]);
  fail(questions.error);
  fail(options.error);
  const questionRows = (questions.data ?? []) as QuestionRow[];
  const ids = new Set(questionRows.map((row) => row.id));
  return {
    questions: questionRows,
    options: ((options.data ?? []) as OptionRow[]).filter((row) => ids.has(row.question_id)),
  };
}

export const surveyQuery = (announcementId: string, version: number) =>
  queryOptions({
    queryKey: ["announcement-survey", announcementId, version],
    queryFn: () => fetchSurvey(announcementId, version),
  });

export async function fetchAnswers(announcementId: string, version: number): Promise<AnswerRow[]> {
  const { data, error } = await supabase
    .from("announcement_answers")
    .select("id,question_id,version,user_id,option_ids,text_answer,submitted_at")
    .eq("announcement_id", announcementId)
    .eq("version", version);
  fail(error);
  return (data ?? []) as AnswerRow[];
}

export const answersQuery = (announcementId: string, version: number) =>
  queryOptions({
    queryKey: ["announcement-answers", announcementId, version],
    queryFn: () => fetchAnswers(announcementId, version),
  });

export interface AnswerDraft {
  questionId: string;
  optionIds: string[];
  text: string;
}

/** Lưu nháp câu trả lời trước khi xác nhận (không chốt). */
export async function saveAnswerDraft(input: {
  announcementId: string;
  version: number;
  userId: string;
  draft: AnswerDraft;
}) {
  const { error } = await supabase.from("announcement_answers").upsert(
    {
      announcement_id: input.announcementId,
      question_id: input.draft.questionId,
      version: input.version,
      user_id: input.userId,
      option_ids: input.draft.optionIds,
      text_answer: input.draft.text.trim() || null,
    },
    { onConflict: "question_id,user_id,version" },
  );
  fail(error);
}

/** Xác nhận: chốt câu trả lời và chuyển trạng thái trong cùng một giao dịch. */
export async function acknowledgeWithAnswers(announcementId: string, drafts: AnswerDraft[]) {
  const { error } = await supabase.rpc("announcement_acknowledge", {
    _a: announcementId,
    _answers: drafts.map((item) => ({
      question_id: item.questionId,
      option_ids: item.optionIds,
      text: item.text,
    })),
  });
  fail(error);
}

/** Kiểm tra hợp lệ phía UI — database vẫn kiểm tra lại khi xác nhận. */
export function validateAnswers(
  questions: QuestionRow[],
  drafts: Record<string, AnswerDraft>,
): string | null {
  for (const question of questions) {
    const draft = drafts[question.id];
    const optionCount = draft?.optionIds.length ?? 0;
    const text = (draft?.text ?? "").trim();
    if (question.question_type === "short") {
      if (question.is_required && !text) return `Câu hỏi bắt buộc chưa trả lời: ${question.content}`;
      if (text.length > 1000) return "Câu trả lời ngắn tối đa 1.000 ký tự.";
      continue;
    }
    if (question.question_type === "single") {
      if (question.is_required && optionCount !== 1) {
        return `Câu hỏi bắt buộc chưa trả lời: ${question.content}`;
      }
      continue;
    }
    if (question.is_required && optionCount === 0) {
      return `Câu hỏi bắt buộc chưa trả lời: ${question.content}`;
    }
    if (optionCount > 0) {
      if (question.min_select && optionCount < question.min_select) {
        return `Phải chọn tối thiểu ${question.min_select} phương án: ${question.content}`;
      }
      if (question.max_select && optionCount > question.max_select) {
        return `Chỉ được chọn tối đa ${question.max_select} phương án: ${question.content}`;
      }
    }
  }
  return null;
}

/* ------------------------------- PHIÊN BẢN ------------------------------- */

export interface VersionRow {
  id: string;
  version: number;
  title: string;
  body: string;
  due_at: string | null;
  comments_enabled: boolean;
  result_visibility: ResultVisibility;
  reason: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RevisionRow {
  id: string;
  version: number;
  before_data: { title?: string; body?: string } | null;
  after_data: { title?: string; body?: string } | null;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export async function fetchVersions(announcementId: string): Promise<VersionRow[]> {
  const { data, error } = await supabase
    .from("announcement_versions")
    .select(
      "id,version,title,body,due_at,comments_enabled,result_visibility,reason,change_summary,created_by,created_at",
    )
    .eq("announcement_id", announcementId)
    .order("version", { ascending: false });
  fail(error);
  return (data ?? []) as VersionRow[];
}

export async function fetchRevisions(announcementId: string): Promise<RevisionRow[]> {
  const { data, error } = await supabase
    .from("announcement_revisions")
    .select("id,version,before_data,after_data,reason,created_by,created_at")
    .eq("announcement_id", announcementId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []) as unknown as RevisionRow[];
}

export const versionsQuery = (announcementId: string) =>
  queryOptions({
    queryKey: ["announcement-versions", announcementId],
    queryFn: () => fetchVersions(announcementId),
  });

export const revisionsQuery = (announcementId: string) =>
  queryOptions({
    queryKey: ["announcement-revisions", announcementId],
    queryFn: () => fetchRevisions(announcementId),
  });

export interface QuestionDraft {
  type: QuestionType;
  content: string;
  required: boolean;
  min: number | null;
  max: number | null;
  options: string[];
}

export function questionDraftsPayload(drafts: QuestionDraft[]) {
  return drafts.map((item) => ({
    type: item.type,
    content: item.content.trim(),
    required: item.required,
    min: item.min,
    max: item.max,
    options: item.type === "short" ? [] : item.options.map((label) => label.trim()).filter(Boolean),
  }));
}

export async function createMinorRevision(input: {
  announcementId: string;
  title: string;
  body: string;
  reason: string;
}) {
  const { error } = await supabase.rpc("announcement_minor_revision", {
    _a: input.announcementId,
    _title: input.title.trim(),
    _body: input.body,
    _reason: input.reason.trim(),
  });
  fail(error);
}

export async function createNewVersion(input: {
  announcementId: string;
  title: string;
  body: string;
  dueAt: string;
  commentsEnabled: boolean;
  resultVisibility: ResultVisibility;
  reason: string;
  changeSummary: string;
  questions: QuestionDraft[];
}) {
  const { error } = await supabase.rpc("announcement_new_version", {
    _a: input.announcementId,
    _title: input.title.trim(),
    _body: input.body,
    _due_at: input.dueAt,
    _comments_enabled: input.commentsEnabled,
    _result_visibility: input.resultVisibility,
    _reason: input.reason.trim(),
    _change_summary: input.changeSummary.trim(),
    _questions: questionDraftsPayload(input.questions),
  });
  fail(error);
}

export async function revokeAnnouncement(announcementId: string, reason: string) {
  const { error } = await supabase.rpc("announcement_revoke", {
    _a: announcementId,
    _reason: reason.trim(),
  });
  fail(error);
}

export async function setAnnouncementArchived(announcementId: string, archived: boolean) {
  const { error } = await supabase.rpc("announcement_set_archived", {
    _a: announcementId,
    _archived: archived,
  });
  fail(error);
}

export async function duplicateAnnouncement(announcementId: string): Promise<string> {
  const { data, error } = await supabase.rpc("announcement_duplicate", { _a: announcementId });
  fail(error);
  return data as unknown as string;
}

/* ---------------------- CÂU HỎI CỦA BẢN NHÁP (v1) ------------------------ */

/** Ghi lại toàn bộ câu hỏi của bản Nháp — chỉ dùng khi thông báo chưa phát hành. */
export async function replaceDraftQuestions(
  announcementId: string,
  drafts: QuestionDraft[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("announcement_questions")
    .delete()
    .eq("announcement_id", announcementId);
  fail(deleteError);

  let position = 0;
  for (const draft of questionDraftsPayload(drafts)) {
    const { data, error } = await supabase
      .from("announcement_questions")
      .insert({
        announcement_id: announcementId,
        version: 1,
        position,
        question_type: draft.type,
        content: draft.content,
        is_required: draft.required,
        min_select: draft.min,
        max_select: draft.max,
      })
      .select("id")
      .single();
    fail(error);
    const questionId = (data as { id: string }).id;
    if (draft.options.length > 0) {
      const { error: optionError } = await supabase.from("announcement_question_options").insert(
        draft.options.map((label, index) => ({
          question_id: questionId,
          announcement_id: announcementId,
          position: index,
          label,
        })),
      );
      fail(optionError);
    }
    position += 1;
  }
}
