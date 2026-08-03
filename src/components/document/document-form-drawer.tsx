import * as React from "react";

import { Button } from "@/components/ui/button";
import { FormModal } from "@/components/ui/form-modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DOCUMENT_SCOPE_OPTIONS,
  DOCUMENT_SOURCE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPE_LABEL,
  DOCUMENT_SCOPE_LABEL,
  DOCUMENT_SOURCE_LABEL,
  detectDocumentSource,
  isValidDocumentUrl,
  type DocumentScope,
  type DocumentSource,
  type DocumentType,
} from "@/lib/document-catalog";
import type { DocumentDraftInput, DocumentRow } from "@/lib/document-data";
import type { PersonOption } from "@/lib/project-data";

/**
 * CEN DOC-02 — Form tạo/sửa bản nháp tài liệu.
 * Component chỉ kiểm tra dữ liệu tại UI; database (DOC-01) vẫn là chốt cuối.
 */
export interface DocumentFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: DocumentRow | null;
  teams: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  people: PersonOption[];
  /** true khi Admin/CMO — được chọn mọi phạm vi kể cả toàn hệ thống. */
  allowSystemScope: boolean;
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (input: DocumentDraftInput) => void;
  defaultOwnerId: string | null;
  /** DOC-RULE-08B — Admin/CMO tạo là phát hành luôn. */
  publishOnCreate?: boolean;
}

interface FormState {
  name: string;
  doc_type: DocumentType | "";
  scope: DocumentScope | "";
  team_id: string;
  project_id: string;
  description: string;
  source_type: DocumentSource | "";
  source_url: string;
  owner_id: string;
  effective_from: string;
  effective_to: string;
  keywords: string;
  change_note: string;
}

const EMPTY: FormState = {
  name: "",
  doc_type: "",
  scope: "",
  team_id: "",
  project_id: "",
  description: "",
  source_type: "",
  source_url: "",
  owner_id: "",
  effective_from: "",
  effective_to: "",
  keywords: "",
  change_note: "",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const isValidUrl = isValidDocumentUrl;

export function DocumentFormDrawer({
  open,
  onOpenChange,
  document,
  teams,
  projects,
  people,
  allowSystemScope,
  submitting,
  serverError,
  onSubmit,
  defaultOwnerId,
  publishOnCreate = false,
}: DocumentFormDrawerProps) {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [detectedSource, setDetectedSource] = React.useState<DocumentSource | null>(null);
  const [sourceTouched, setSourceTouched] = React.useState(false);

  const initialForm = React.useMemo<FormState>(() => {
    if (document) {
      return {
        name: document.name,
        doc_type: document.doc_type,
        scope: document.scope,
        team_id: document.team_id ?? "",
        project_id: document.project_id ?? "",
        description: document.description ?? "",
        source_type: document.source_type,
        source_url: document.source_url,
        owner_id: document.owner_id,
        effective_from: document.latestVersion?.effective_from ?? todayISO(),
        effective_to: document.latestVersion?.effective_to ?? "",
        keywords: document.keywords.join(", "),
        change_note: document.latestVersion?.change_note ?? "",
      };
    }
    return { ...EMPTY, owner_id: defaultOwnerId ?? "", effective_from: todayISO() };
  }, [document, defaultOwnerId]);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setDetectedSource(null);
    setSourceTouched(Boolean(document));
    setForm(initialForm);
  }, [open, document, initialForm]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /** DOC-03A — nhập URL mới thì nhận diện lại loại nguồn. */
  const handleUrlChange = (value: string) => {
    const detected = detectDocumentSource(value);
    setDetectedSource(detected);
    setSourceTouched(false);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.source_url;
      delete next.source_type;
      return next;
    });
    setForm((prev) => ({
      ...prev,
      source_url: value,
      source_type: detected ?? prev.source_type,
    }));
  };


  const scopeOptions = DOCUMENT_SCOPE_OPTIONS.filter(
    (option) => option.value !== "system" || allowSystemScope,
  );

  const displayName =
    form.doc_type && form.scope
      ? `${DOCUMENT_TYPE_LABEL[form.doc_type]} | ${
          form.scope === "system"
            ? DOCUMENT_SCOPE_LABEL.system
            : form.scope === "team"
              ? (teams.find((t) => t.id === form.team_id)?.name ?? DOCUMENT_SCOPE_LABEL.team)
              : (projects.find((p) => p.id === form.project_id)?.name ??
                DOCUMENT_SCOPE_LABEL.project)
        } | ${form.name.trim().replace(/\s+/g, " ") || "Tên nội dung"}`
      : "Chọn loại và phạm vi để xem tên hiển thị";

  function validate(): DocumentDraftInput | null {
    const next: Partial<Record<keyof FormState, string>> = {};
    const name = form.name.trim().replace(/\s+/g, " ");
    if (!name) next.name = "Nhập tên nội dung.";
    if (!form.doc_type) next.doc_type = "Chọn loại tài liệu.";
    if (!form.scope) next.scope = "Chọn phạm vi.";
    if (form.scope === "team" && !form.team_id) next.team_id = "Chọn Team áp dụng.";
    if (form.scope === "project" && !form.project_id) next.project_id = "Chọn Dự án áp dụng.";
    if (!form.description.trim()) next.description = "Nhập mô tả ngắn.";
    if (!form.source_type) next.source_type = "Chọn loại nguồn.";
    if (!form.source_url.trim()) next.source_url = "Nhập đường dẫn tài liệu.";
    else if (!isValidUrl(form.source_url.trim()))
      next.source_url = "Đường dẫn phải bắt đầu bằng http:// hoặc https://";
    if (!form.owner_id) next.owner_id = "Chọn người phụ trách đang hoạt động.";
    if (!form.effective_from) next.effective_from = "Chọn ngày hiệu lực.";
    if (form.effective_to && form.effective_from && form.effective_to < form.effective_from) {
      next.effective_to = "Ngày hết hiệu lực không được trước ngày hiệu lực.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    return {
      name,
      doc_type: form.doc_type as DocumentType,
      scope: form.scope as DocumentScope,
      team_id: form.team_id || null,
      project_id: form.project_id || null,
      description: form.description.trim(),
      source_type: form.source_type as DocumentSource,
      source_url: form.source_url.trim(),
      owner_id: form.owner_id,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      keywords: form.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      change_note: form.change_note.trim(),
    };
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const input = validate();
    if (input) onSubmit(input);
  };

  return (
    <FormModal
      open={open}
      size="lg"
      dirty={dirty}
      busy={submitting}
      onOpenChange={submitting ? () => undefined : onOpenChange}
      title={
        document
          ? "Sửa bản nháp tài liệu"
          : publishOnCreate
            ? "Tạo tài liệu"
            : "Tạo bản nháp tài liệu"
      }
      description={
        publishOnCreate && !document
          ? "Tài liệu sẽ được phát hành ngay khi tạo. Tên hiển thị do hệ thống tự tạo."
          : "Phiên bản đầu tiên luôn là v1 ở trạng thái nháp. Tên hiển thị do hệ thống tự tạo."
      }
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Hủy
          </Button>
          <Button type="submit" form="document-form" loading={submitting} disabled={submitting}>
            {document ? "Lưu bản nháp" : publishOnCreate ? "Tạo tài liệu" : "Tạo bản nháp"}
          </Button>
        </>
      }
    >
      <form id="document-form" className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {serverError ? (
          <p role="alert" className="rounded-control border border-state-danger/40 bg-state-danger/10 p-2 text-helper text-state-danger">
            {serverError}
          </p>
        ) : null}

        <FormField id="doc-name" label="Tên nội dung" required error={errors.name}>
          {(props) => (
            <Input
              {...props}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ví dụ: Quy trình duyệt nội dung"
            />
          )}
        </FormField>

        <FormField id="doc-type" label="Loại tài liệu" required error={errors.doc_type}>
          {(props) => (
            <Select value={form.doc_type} onValueChange={(v) => set("doc_type", v as DocumentType)}>
              <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                <SelectValue placeholder="Chọn loại tài liệu" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField id="doc-scope" label="Phạm vi" required error={errors.scope}>
          {(props) => (
            <Select
              value={form.scope}
              onValueChange={(v) => {
                set("scope", v as DocumentScope);
                if (v !== "team") set("team_id", "");
                if (v !== "project") set("project_id", "");
              }}
            >
              <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                <SelectValue placeholder="Chọn phạm vi áp dụng" />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {form.scope === "team" ? (
          <FormField
            id="doc-team"
            label="Team áp dụng"
            required
            error={errors.team_id}
            helperText={teams.length === 0 ? "Bạn chưa thuộc Team nào." : undefined}
          >
            {(props) => (
              <Select value={form.team_id} onValueChange={(v) => set("team_id", v)}>
                <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]} disabled={teams.length === 0}>
                  <SelectValue placeholder="Chọn Team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}

        {form.scope === "project" ? (
          <FormField
            id="doc-project"
            label="Dự án áp dụng"
            required
            error={errors.project_id}
            helperText={projects.length === 0 ? "Bạn chưa tham gia dự án nào." : undefined}
          >
            {(props) => (
              <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
                <SelectTrigger
                  id={props.id}
                  aria-invalid={props["aria-invalid"]}
                  disabled={projects.length === 0}
                >
                  <SelectValue placeholder="Chọn dự án" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : null}

        <FormField
          id="doc-display"
          label="Tên hiển thị (tự tạo)"
          helperText="Hệ thống tự ghép [LOẠI] | [PHẠM VI] | [TÊN NỘI DUNG]."
        >
          {(props) => <Input {...props} value={displayName} readOnly disabled />}
        </FormField>

        <FormField id="doc-description" label="Mô tả ngắn" required error={errors.description}>
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          )}
        </FormField>

        <FormField
          id="doc-url"
          label="Đường dẫn tài liệu"
          required
          error={errors.source_url}
          helperText="Nhập link trước, hệ thống sẽ tự nhận diện loại nguồn."
        >
          {(props) => (
            <Input
              {...props}
              value={form.source_url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://"
              inputMode="url"
            />
          )}
        </FormField>

        <FormField
          id="doc-source"
          label="Loại nguồn"
          required
          error={errors.source_type}
          helperText={
            detectedSource && !sourceTouched
              ? `Đã tự nhận diện: ${DOCUMENT_SOURCE_LABEL[detectedSource]}. Sửa lại nếu chưa đúng.`
              : "Có thể chọn lại thủ công."
          }
        >
          {(props) => (
            <Select
              value={form.source_type}
              onValueChange={(v) => {
                setSourceTouched(true);
                set("source_type", v as DocumentSource);
              }}
            >
              <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                <SelectValue placeholder="Chọn nguồn tài liệu" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>


        <FormField id="doc-owner" label="Người phụ trách" required error={errors.owner_id}>
          {(props) => (
            <Select value={form.owner_id} onValueChange={(v) => set("owner_id", v)}>
              <SelectTrigger id={props.id} aria-invalid={props["aria-invalid"]}>
                <SelectValue placeholder="Chọn người phụ trách" />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="doc-from" label="Ngày hiệu lực" required error={errors.effective_from}>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={form.effective_from}
                onChange={(e) => set("effective_from", e.target.value)}
              />
            )}
          </FormField>
          <FormField id="doc-to" label="Ngày hết hiệu lực" error={errors.effective_to}>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={form.effective_to}
                onChange={(e) => set("effective_to", e.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField
          id="doc-keywords"
          label="Từ khóa / thẻ"
          helperText="Ngăn cách bằng dấu phẩy."
        >
          {(props) => (
            <Input
              {...props}
              value={form.keywords}
              onChange={(e) => set("keywords", e.target.value)}
              placeholder="quy trình, nội dung, marketing"
            />
          )}
        </FormField>

        <FormField id="doc-note" label="Ghi chú phiên bản">
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={form.change_note}
              onChange={(e) => set("change_note", e.target.value)}
            />
          )}
        </FormField>
      </form>
    </FormModal>
  );
}
