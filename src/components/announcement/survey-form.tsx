import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { AnswerDraft, OptionRow, QuestionRow } from "@/lib/announcement-interaction";

/**
 * CEN 1.0 — M6.2 form khảo sát trong thông báo nội bộ.
 * Không tự gọi API: trạng thái do trang chi tiết giữ và chốt cùng lúc với xác nhận.
 */
interface Props {
  questions: QuestionRow[];
  options: OptionRow[];
  drafts: Record<string, AnswerDraft>;
  readOnly?: boolean;
  onChange: (questionId: string, next: AnswerDraft) => void;
}

export function SurveyForm({ questions, options, drafts, readOnly, onChange }: Props) {
  const optionsByQuestion = React.useMemo(() => {
    const map = new Map<string, OptionRow[]>();
    for (const option of options) {
      map.set(option.question_id, [...(map.get(option.question_id) ?? []), option]);
    }
    return map;
  }, [options]);

  if (questions.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {questions.map((question, index) => {
        const draft = drafts[question.id] ?? {
          questionId: question.id,
          optionIds: [],
          text: "",
        };
        const list = optionsByQuestion.get(question.id) ?? [];
        return (
          <div key={question.id} className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="min-w-0 break-words text-body-sm font-medium text-text-primary">
                {index + 1}. {question.content}
              </p>
              {question.is_required ? <Badge variant="error">Bắt buộc</Badge> : null}
              {question.question_type === "multi" &&
              (question.min_select || question.max_select) ? (
                <Badge variant="neutral">
                  Chọn {question.min_select ?? 1}–{question.max_select ?? list.length}
                </Badge>
              ) : null}
            </div>

            {question.question_type === "single" ? (
              <RadioGroup
                value={draft.optionIds[0] ?? ""}
                disabled={readOnly}
                onValueChange={(value) =>
                  onChange(question.id, { ...draft, questionId: question.id, optionIds: [value] })
                }
                className="flex flex-col gap-2"
              >
                {list.map((option) => (
                  <div key={option.id} className="flex min-w-0 items-center gap-2">
                    <RadioGroupItem value={option.id} id={`opt-${option.id}`} />
                    <Label htmlFor={`opt-${option.id}`} className="min-w-0 break-words">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : null}

            {question.question_type === "multi" ? (
              <div className="flex min-w-0 flex-col gap-2">
                {list.map((option) => {
                  const checked = draft.optionIds.includes(option.id);
                  return (
                    <div key={option.id} className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        id={`opt-${option.id}`}
                        checked={checked}
                        disabled={readOnly}
                        onCheckedChange={(next) =>
                          onChange(question.id, {
                            ...draft,
                            questionId: question.id,
                            optionIds:
                              next === true
                                ? [...draft.optionIds, option.id]
                                : draft.optionIds.filter((id) => id !== option.id),
                          })
                        }
                      />
                      <Label htmlFor={`opt-${option.id}`} className="min-w-0 break-words">
                        {option.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {question.question_type === "short" ? (
              <div className="flex min-w-0 flex-col gap-1">
                <Textarea
                  rows={3}
                  value={draft.text}
                  maxLength={1000}
                  disabled={readOnly}
                  aria-label={question.content}
                  onChange={(event) =>
                    onChange(question.id, {
                      ...draft,
                      questionId: question.id,
                      text: event.target.value,
                    })
                  }
                />
                <p className="text-body-xs text-text-muted">{draft.text.length}/1000 ký tự</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
