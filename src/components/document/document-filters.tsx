import * as React from "react";
import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_SCOPE_OPTIONS,
  DOCUMENT_SOURCE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_VERSION_STATUS_OPTIONS,
} from "@/lib/document-catalog";
import {
  ALL,
  hasActiveDocumentFilters,
  type DocumentFilterState,
} from "@/lib/document-view";
import type { PersonOption } from "@/lib/project-data";

/**
 * CEN DOC-02 — Bộ lọc nâng cao cho Thư viện Tài liệu.
 * Chỉ lọc trên dữ liệu người dùng đã được RLS cho phép đọc.
 */
export interface DocumentFiltersProps {
  filters: DocumentFilterState;
  onChange: (next: DocumentFilterState) => void;
  onReset: () => void;
  teams: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  people: PersonOption[];
}

export function DocumentFilters({
  filters,
  onChange,
  onReset,
  teams,
  projects,
  people,
}: DocumentFiltersProps) {
  const set = <K extends keyof DocumentFilterState>(key: K, value: DocumentFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  const active = hasActiveDocumentFilters(filters);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <Filter className="size-icon-sm" aria-hidden="true" />
          Bộ lọc
          {active ? (
            <span className="ml-1 rounded-full bg-brand-primary px-1.5 text-caption text-text-inverse">
              •
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto">
        <div className="flex flex-col gap-3">
          <FormField id="f-type" label="Loại tài liệu">
            {(props) => (
              <Select value={filters.docType} onValueChange={(v) => set("docType", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {DOCUMENT_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField id="f-scope" label="Phạm vi">
            {(props) => (
              <Select value={filters.scope} onValueChange={(v) => set("scope", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {DOCUMENT_SCOPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField id="f-team" label="Team">
            {(props) => (
              <Select value={filters.teamId} onValueChange={(v) => set("teamId", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField id="f-project" label="Dự án">
            {(props) => (
              <Select value={filters.projectId} onValueChange={(v) => set("projectId", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField id="f-status" label="Trạng thái">
            {(props) => (
              <Select value={filters.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {DOCUMENT_VERSION_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField id="f-source" label="Nguồn">
            {(props) => (
              <Select value={filters.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {DOCUMENT_SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField id="f-owner" label="Người phụ trách">
            {(props) => (
              <Select value={filters.ownerId} onValueChange={(v) => set("ownerId", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField id="f-creator" label="Người tạo">
            {(props) => (
              <Select value={filters.creatorId} onValueChange={(v) => set("creatorId", v)}>
                <SelectTrigger id={props.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-2">
            <FormField id="f-eff-from" label="Hiệu lực từ">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={filters.effectiveFrom}
                  onChange={(e) => set("effectiveFrom", e.target.value)}
                />
              )}
            </FormField>
            <FormField id="f-eff-to" label="Hiệu lực đến">
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={filters.effectiveTo}
                  onChange={(e) => set("effectiveTo", e.target.value)}
                />
              )}
            </FormField>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="f-review"
              checked={filters.needsReview}
              onCheckedChange={(v) => set("needsReview", v === true)}
            />
            <Label htmlFor="f-review" className="text-label text-text-secondary">
              Chỉ tài liệu cần kiểm tra
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="f-archived"
              checked={filters.includeArchived}
              onCheckedChange={(v) => set("includeArchived", v === true)}
            />
            <Label htmlFor="f-archived" className="text-label text-text-secondary">
              Hiển thị cả tài liệu đã lưu trữ
            </Label>
          </div>

          <Button variant="ghost" size="sm" onClick={onReset} disabled={!active}>
            <X className="size-icon-sm" aria-hidden="true" />
            Xóa bộ lọc
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
