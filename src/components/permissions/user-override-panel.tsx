import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SCOPE_LABEL, type CatalogRow, type DataScope, type OverrideRow } from "@/lib/permission-data";

export type OverrideChoice = "inherit" | "allow" | "deny";

export interface OverrideDraft {
  choice: OverrideChoice;
  data_scope: string | null;
  reason: string;
}

export function overrideDraftFrom(row: OverrideRow | undefined): OverrideDraft {
  return {
    choice: (row?.override_type ?? "inherit") as OverrideChoice,
    data_scope: row?.data_scope ?? null,
    reason: row?.reason ?? "",
  };
}

/** ROLE-01 — cấu hình ngoại lệ quyền cho một người dùng cụ thể. */
export function UserOverridePanel({
  catalog,
  drafts,
  roleStates,
  editing,
  changedKeys,
  onChange,
}: {
  catalog: CatalogRow[];
  drafts: Record<string, OverrideDraft>;
  roleStates: Record<string, { enabled: boolean; data_scope: string }>;
  editing: boolean;
  changedKeys: Set<string>;
  onChange: (permissionKey: string, next: OverrideDraft) => void;
}) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, CatalogRow[]>();
    for (const row of catalog) {
      const list = map.get(row.module) ?? [];
      list.push(row);
      map.set(row.module, list);
    }
    return [...map.entries()];
  }, [catalog]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {grouped.map(([module, rows]) => (
        <div key={module} className="flex min-w-0 flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-muted">{module}</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {rows.map((row) => {
              const draft = drafts[row.permission_key] ?? {
                choice: "inherit" as OverrideChoice,
                data_scope: null,
                reason: "",
              };
              const fromRole = roleStates[row.permission_key];
              const changed = changedKeys.has(row.permission_key);
              return (
                <div
                  key={row.permission_key}
                  className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 ${changed ? "border-brand/50 bg-brand/5" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-text-muted">
                        Theo vai trò:{" "}
                        {fromRole?.enabled
                          ? `Cho phép · ${SCOPE_LABEL[fromRole.data_scope as DataScope] ?? fromRole.data_scope}`
                          : "Không cho phép"}
                      </p>
                    </div>
                    {draft.choice !== "inherit" ? (
                      <Badge variant={draft.choice === "allow" ? "success" : "error"} size="sm">
                        {draft.choice === "allow" ? "Cho phép riêng" : "Từ chối riêng"}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      value={draft.choice}
                      disabled={!editing || !row.is_configurable}
                      onValueChange={(value) =>
                        onChange(row.permission_key, { ...draft, choice: value as OverrideChoice })
                      }
                    >
                      <SelectTrigger aria-label={`Ngoại lệ ${row.label}`} className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">Theo vai trò</SelectItem>
                        <SelectItem value="allow">Cho phép riêng</SelectItem>
                        <SelectItem value="deny">Từ chối riêng</SelectItem>
                      </SelectContent>
                    </Select>

                    {draft.choice === "allow" && row.allowed_scopes.length > 1 ? (
                      <Select
                        value={draft.data_scope ?? row.allowed_scopes[0]!}
                        disabled={!editing}
                        onValueChange={(value) =>
                          onChange(row.permission_key, { ...draft, data_scope: value })
                        }
                      >
                        <SelectTrigger aria-label={`Phạm vi riêng ${row.label}`} className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {row.allowed_scopes.map((scope) => (
                            <SelectItem key={scope} value={scope}>
                              {SCOPE_LABEL[scope as DataScope] ?? scope}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>

                  {draft.choice !== "inherit" ? (
                    <Input
                      value={draft.reason}
                      disabled={!editing}
                      placeholder="Lý do ngoại lệ"
                      aria-label={`Lý do ngoại lệ ${row.label}`}
                      onChange={(event) =>
                        onChange(row.permission_key, { ...draft, reason: event.target.value })
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
