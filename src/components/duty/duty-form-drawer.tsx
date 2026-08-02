import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DrawerPanel } from "@/components/ui/drawer-panel";
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
  DUTY_DUE_TIME,
  DUTY_END_TIME,
  DUTY_START_TIME,
  type DutyAssignmentInput,
  type DutyAssignmentRow,
  type DutyCatalog,
} from "@/lib/duty-data";

/**
 * CEN DUTY-02 — Form tạo/sửa lịch trực nhật (thủ công từng ngày).
 * Không nhập tên tự do: nhân sự chọn từ danh sách tài khoản đang hoạt động.
 */
export interface DutyPerson {
  id: string;
  display_name: string;
}

interface FormState {
  duty_date: string;
  area_id: string;
  job_type_id: string;
  duty_team_id: string;
  external_provider_id: string;
  note: string;
  assigneeIds: string[];
}

const NONE = "__none__";

const EMPTY: FormState = {
  duty_date: "",
  area_id: "",
  job_type_id: "",
  duty_team_id: "",
  external_provider_id: "",
  note: "",
  assigneeIds: [],
};

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function DutyFormDrawer({
  open,
  onOpenChange,
  assignment,
  catalog,
  people,
  submitting,
  serverError,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment?: DutyAssignmentRow | null;
  catalog: DutyCatalog;
  people: DutyPerson[];
  submitting: boolean;
  serverError?: string | null;
  onSubmit: (input: DutyAssignmentInput) => void;
}) {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    if (assignment) {
      setForm({
        duty_date: assignment.duty_date,
        area_id: assignment.area_id,
        job_type_id: assignment.job_type_id,
        duty_team_id: assignment.duty_team_id ?? "",
        external_provider_id: assignment.external_provider_id ?? "",
        note: assignment.note ?? "",
        assigneeIds: assignment.memberIds.length
          ? assignment.memberIds
          : assignment.assignee_id
            ? [assignment.assignee_id]
            : [],
      });
    } else {
      setForm({ ...EMPTY, duty_date: todayISO() });
    }
  }, [open, assignment]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const togglePerson = (id: string) => {
    setForm((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(id)
        ? prev.assigneeIds.filter((x) => x !== id)
        : [...prev.assigneeIds, id],
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.assigneeIds;
      return next;
    });
  };

  const submit = () => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.duty_date) next.duty_date = "Chọn ngày trực.";
    if (!form.area_id) next.area_id = "Chọn khu vực.";
    if (!form.job_type_id) next.job_type_id = "Chọn nhiệm vụ.";
    if (form.assigneeIds.length === 0 && !form.external_provider_id) {
      next.assigneeIds = "Chọn ít nhất một nhân sự hoặc một dịch vụ ngoài.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      id: assignment?.id ?? null,
      duty_date: form.duty_date,
      area_id: form.area_id,
      job_type_id: form.job_type_id,
      duty_team_id: form.duty_team_id || null,
      assigneeIds: form.assigneeIds,
      external_provider_id: form.external_provider_id || null,
      note: form.note.trim() ? form.note.trim() : null,
    });
  };

  return (
    <DrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title={assignment ? "Sửa lịch trực nhật" : "Tạo lịch trực nhật"}
      description={`Giờ trực ${DUTY_START_TIME}–${DUTY_END_TIME}, hạn hoàn thành ${DUTY_DUE_TIME} cùng ngày.`}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={submitting}>
            Hủy
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Đang lưu…" : "Lưu lịch trực"}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <FormField id="duty-date" label="Ngày trực" required error={errors.duty_date}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={form.duty_date}
              onChange={(e) => set("duty_date", e.target.value)}
            />
          )}
        </FormField>

        <FormField id="duty-area" label="Khu vực" required error={errors.area_id}>
          {(p) => (
            <Select value={form.area_id} onValueChange={(v) => set("area_id", v)}>
              <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]}>
                <SelectValue placeholder="Chọn khu vực" />
              </SelectTrigger>
              <SelectContent>
                {catalog.areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField id="duty-job" label="Nhiệm vụ" required error={errors.job_type_id}>
          {(p) => (
            <Select value={form.job_type_id} onValueChange={(v) => set("job_type_id", v)}>
              <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]}>
                <SelectValue placeholder="Chọn nhiệm vụ" />
              </SelectTrigger>
              <SelectContent>
                {catalog.jobTypes.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField id="duty-team" label="Team phụ trách">
          {(p) => (
            <Select
              value={form.duty_team_id || NONE}
              onValueChange={(v) => set("duty_team_id", v === NONE ? "" : v)}
            >
              <SelectTrigger id={p.id}>
                <SelectValue placeholder="Chọn team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Không chọn</SelectItem>
                {catalog.teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          id="duty-people"
          label="Nhân sự CEN phụ trách"
          helperText="Chọn một hoặc nhiều người. Một người bấm hoàn thành là cả phân công hoàn thành."
          error={errors.assigneeIds}
        >
          {() => (
            <div
              id="duty-people"
              className="max-h-56 min-w-0 overflow-y-auto rounded-control border border-border-default p-2"
            >
              {people.length === 0 ? (
                <p className="p-2 text-caption text-text-muted">Chưa có nhân sự đang hoạt động.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {people.map((person) => (
                    <li key={person.id}>
                      <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 hover:bg-surface-subtle">
                        <Checkbox
                          checked={form.assigneeIds.includes(person.id)}
                          onCheckedChange={() => togglePerson(person.id)}
                        />
                        <span className="min-w-0 truncate text-body text-text-primary">
                          {person.display_name}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </FormField>

        <FormField id="duty-provider" label="Dịch vụ ngoài">
          {(p) => (
            <Select
              value={form.external_provider_id || NONE}
              onValueChange={(v) => set("external_provider_id", v === NONE ? "" : v)}
            >
              <SelectTrigger id={p.id}>
                <SelectValue placeholder="Không dùng dịch vụ ngoài" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Không dùng</SelectItem>
                {catalog.providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField id="duty-note" label="Ghi chú">
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="Ghi chú thêm nếu cần"
            />
          )}
        </FormField>

        {serverError ? <p className="text-caption text-state-danger">{serverError}</p> : null}
      </div>
    </DrawerPanel>
  );
}
