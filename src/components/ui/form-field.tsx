import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface FormFieldProps {
  /** id của control bên trong; dùng để liên kết label / helper / error. */
  id: string;
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  className?: string;
  /** Render control với các props accessibility đã được nối sẵn. */
  children: (controlProps: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
    "aria-required"?: true;
  }) => React.ReactNode;
}

/**
 * Form Field dùng chung: Label + required indicator + control + helper text + validation message.
 * Component chỉ nhận props và hiển thị UI, không chứa logic nghiệp vụ.
 */
export function FormField({
  id,
  label,
  required,
  helperText,
  error,
  className,
  children,
}: FormFieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-label font-medium text-text-secondary">
        <span className="break-words">{label}</span>
        {required ? (
          <span className="ml-1 text-state-danger" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (bắt buộc)</span> : null}
      </Label>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}

      {helperText ? (
        <p id={helperId} className="text-helper text-text-muted">
          {helperText}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-helper font-medium text-state-danger"
        >
          <AlertCircle className="mt-px size-icon-sm shrink-0" aria-hidden="true" />
          <span className="break-words">{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Wrapper cho control dạng chọn (checkbox / radio / switch) + label bên phải. */
export function ControlRow({
  htmlFor,
  label,
  description,
  control,
  className,
}: {
  htmlFor: string;
  label: string;
  description?: string;
  control: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-1", className)}>
      <div className="flex h-6 items-center">{control}</div>
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="text-label font-medium text-text-primary">
          {label}
        </Label>
        {description ? <p className="text-helper text-text-muted">{description}</p> : null}
      </div>
    </div>
  );
}
