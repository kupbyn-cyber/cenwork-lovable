import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import {
  QUESTION_TYPE_LABEL,
  type QuestionDraft,
  type QuestionType,
} from "@/lib/announcement-interaction";

/**
 * CEN 1.0 — M6.2 soạn câu hỏi khảo sát.
 * Chỉ dựng dữ liệu; kiểm tra hợp lệ cuối cùng do database quyết định.
 */
const TYPES: QuestionType[] = ["single", "multi", "short"];

export function emptyQuestion(): QuestionDraft {
  return { type: "single", content: "", required: false, min: null, max: null, options: ["", ""] };
}

export function validateQuestionDrafts(drafts: QuestionDraft[]): string | null {
  for (const draft of drafts) {
    if (!draft.content.trim()) return "Mỗi câu hỏi phải có nội dung.";
    if (draft.type === "short") continue;
    const options = draft.options.map((item) => item.trim()).filter(Boolean);
    if (options.length < 2) return "Câu hỏi lựa chọn phải có ít nhất 2 phương án.";
    if (draft.type === "multi") {
      const min = draft.min ?? 1;
      const max = draft.max ?? options.length;
      if (min < 1) return "Số lựa chọn tối thiểu phải từ 1 trở lên.";
      if (max > options.length) return "Số lựa chọn tối đa không được vượt số phương án.";
      if (min > max) return "Tối thiểu không được lớn hơn tối đa.";
    }
  }
  return null;
}

interface Props {
  value: QuestionDraft[];
  disabled?: boolean;
  onChange: (next: QuestionDraft[]) => void;
}

export function QuestionEditor({ value, disabled, onChange }: Props) {
  function update(index: number, patch: Partial<QuestionDraft>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeader
        title="Khảo sát và bình chọn"
        description="Tùy chọn. Có thể kết hợp một lựa chọn, nhiều lựa chọn và trả lời ngắn."
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onChange([...value, emptyQuestion()])}
          >
            <Plus aria-hidden className="size-4" /> Thêm câu hỏi
          </Button>
        }
      />

      {value.length === 0 ? (
        <p className="text-body-sm text-text-muted">Chưa có câu hỏi nào.</p>
      ) : null}

      {value.map((question, index) => (
        <div
          key={index}
          className="flex min-w-0 flex-col gap-3 rounded-control border border-border-default p-3"
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="text-body-sm font-medium text-text-primary">Câu {index + 1}</p>
            <IconButton
              type="button"
              variant="ghost"
              size="icon-sm"
              label="Xóa câu hỏi"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden className="size-4" />
            </IconButton>
          </div>

          <FormField id={`q-content-${index}`} label="Nội dung câu hỏi" required>
            {(props) => (
              <Input
                {...props}
                value={question.content}
                maxLength={500}
                disabled={disabled}
                onChange={(event) => update(index, { content: event.target.value })}
              />
            )}
          </FormField>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField id={`q-type-${index}`} label="Loại câu hỏi">
              {(props) => (
                <select
                  {...props}
                  value={question.type}
                  disabled={disabled}
                  onChange={(event) => update(index, { type: event.target.value as QuestionType })}
                  className="h-10 w-full rounded-control border border-border-default bg-surface-raised px-3 text-body-sm text-text-primary cen-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {QUESTION_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id={`q-required-${index}`}
                checked={question.required}
                disabled={disabled}
                onCheckedChange={(checked) => update(index, { required: checked === true })}
              />
              <Label htmlFor={`q-required-${index}`}>Bắt buộc trả lời</Label>
            </div>
          </div>

          {question.type !== "short" ? (
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-body-sm text-text-muted">Phương án trả lời</p>
              {question.options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex min-w-0 items-center gap-2">
                  <Input
                    value={option}
                    maxLength={200}
                    disabled={disabled}
                    aria-label={`Phương án ${optionIndex + 1}`}
                    onChange={(event) =>
                      update(index, {
                        options: question.options.map((item, i) =>
                          i === optionIndex ? event.target.value : item,
                        ),
                      })
                    }
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    label="Xóa phương án"
                    disabled={disabled || question.options.length <= 2}
                    onClick={() =>
                      update(index, {
                        options: question.options.filter((_, i) => i !== optionIndex),
                      })
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </IconButton>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => update(index, { options: [...question.options, ""] })}
              >
                <Plus aria-hidden className="size-4" /> Thêm phương án
              </Button>
            </div>
          ) : null}

          {question.type === "multi" ? (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField id={`q-min-${index}`} label="Chọn tối thiểu">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    value={question.min ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, {
                        min: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                )}
              </FormField>
              <FormField id={`q-max-${index}`} label="Chọn tối đa">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    value={question.max ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, {
                        max: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                )}
              </FormField>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
