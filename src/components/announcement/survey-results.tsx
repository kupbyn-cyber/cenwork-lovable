import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import {
  answersQuery,
  surveyQuery,
  type AnswerRow,
  type OptionRow,
  type QuestionRow,
} from "@/lib/announcement-interaction";
import { RESULT_VISIBILITY_LABEL, type ResultVisibility } from "@/lib/announcement-data";

/**
 * CEN 1.0 — M6.2 thống kê khảo sát.
 * Kết quả chỉ tổng hợp trên dữ liệu người dùng hiện tại được phép đọc theo RLS.
 */
interface Props {
  announcementId: string;
  version: number;
  visibility: ResultVisibility;
  canSeeFullResult: boolean;
}

export function SurveyResults({
  announcementId,
  version,
  visibility,
  canSeeFullResult,
}: Props) {
  const survey = useQuery(surveyQuery(announcementId, version));
  const answers = useQuery(answersQuery(announcementId, version));

  const questions: QuestionRow[] = survey.data?.questions ?? [];
  const options: OptionRow[] = survey.data?.options ?? [];
  const rows: AnswerRow[] = answers.data ?? [];

  const countByOption = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.option_id) continue;
      map.set(row.option_id, (map.get(row.option_id) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  if (survey.isPending || answers.isPending) {
    return <Spinner label="Đang tải kết quả khảo sát" />;
  }

  if (questions.length === 0) {
    return <EmptyState title="Thông báo này không có khảo sát" />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {!canSeeFullResult ? (
        <p className="text-body-xs text-text-muted">
          Chế độ công khai: {RESULT_VISIBILITY_LABEL[visibility]}
        </p>
      ) : null}

      {questions.map((question) => {
        const list = options.filter((option) => option.question_id === question.id);
        const texts = rows.filter(
          (row) => row.question_id === question.id && row.answer_text,
        );
        const total =
          question.question_type === "short"
            ? texts.length
            : list.reduce((sum, option) => sum + (countByOption.get(option.id) ?? 0), 0);

        return (
          <div key={question.id} className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="min-w-0 break-words text-body-sm font-medium text-text-primary">
                {question.content}
              </p>
              <Badge variant="neutral">{total} lượt trả lời</Badge>
            </div>

            {question.question_type === "short" ? (
              <div className="flex min-w-0 flex-col gap-2">
                {texts.length === 0 ? (
                  <p className="text-body-sm text-text-muted">Chưa có câu trả lời.</p>
                ) : (
                  texts.map((row) => (
                    <p
                      key={row.id}
                      className="min-w-0 break-words rounded-control border border-border-default p-2 text-body-sm text-text-secondary"
                    >
                      {row.answer_text}
                    </p>
                  ))
                )}
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-2">
                {list.map((option) => {
                  const count = countByOption.get(option.id) ?? 0;
                  const percent = total === 0 ? 0 : Math.round((count / total) * 100);
                  return (
                    <div key={option.id} className="flex min-w-0 flex-col gap-1">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 break-words text-body-sm text-text-secondary">
                          {option.label}
                        </span>
                        <span className="shrink-0 text-body-xs text-text-muted">
                          {count} • {percent}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full bg-brand-primary"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
