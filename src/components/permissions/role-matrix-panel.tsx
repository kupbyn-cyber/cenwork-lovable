import * as React from "react";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLE_LABEL } from "@/lib/org-data";
import { SCOPE_LABEL, type CatalogRow, type DataScope } from "@/lib/permission-data";
import { ROLE_ORDER, type AppRoleKey } from "@/lib/permissions";

/** Trạng thái một ô ma trận (vai trò × quyền). */
export interface CellState {
  enabled: boolean;
  data_scope: string;
}

export type CellKey = `${AppRoleKey}|${string}`;

export function cellKey(role: AppRoleKey, permission: string): CellKey {
  return `${role}|${permission}` as CellKey;
}

function ScopeSelect({
  value,
  options,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: string;
  options: string[];
  disabled: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  if (options.length <= 1) {
    return <span className="text-xs text-text-muted">{SCOPE_LABEL[value as DataScope] ?? value}</span>;
  }
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 w-full min-w-[150px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((scope) => (
          <SelectItem key={scope} value={scope}>
            {SCOPE_LABEL[scope as DataScope] ?? scope}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Cell({
  catalog,
  state,
  editing,
  changed,
  onChange,
  label,
}: {
  catalog: CatalogRow;
  state: CellState;
  editing: boolean;
  changed: boolean;
  label: string;
  onChange: (next: CellState) => void;
}) {
  const locked = !catalog.is_configurable;
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-md p-1.5 ${changed ? "bg-brand/10 ring-1 ring-brand/40" : ""}`}
    >
      <div className="flex items-center gap-2">
        {locked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="size-4 text-text-muted" aria-label="Quyền không thể cấu hình" />
            </TooltipTrigger>
            <TooltipContent>Quyền hệ thống, không thể cấu hình.</TooltipContent>
          </Tooltip>
        ) : (
          <Checkbox
            checked={state.enabled}
            disabled={!editing}
            aria-label={label}
            onCheckedChange={(checked) => onChange({ ...state, enabled: checked === true })}
          />
        )}
        <span className="text-xs text-text-muted">
          {state.enabled ? "Cho phép" : "Không cho phép"}
        </span>
      </div>
      {state.enabled ? (
        <ScopeSelect
          value={state.data_scope}
          options={catalog.allowed_scopes}
          disabled={!editing || locked}
          ariaLabel={`Phạm vi ${label}`}
          onChange={(scope) => onChange({ ...state, data_scope: scope })}
        />
      ) : null}
    </div>
  );
}

/**
 * ROLE-01 — ma trận quyền theo vai trò.
 * Desktop: bảng 4 cột vai trò. Tablet/mobile: chọn một vai trò, nhóm theo module.
 */
export function RoleMatrixPanel({
  catalog,
  states,
  editing,
  changedKeys,
  onChange,
  isMobile,
  activeRole,
  onActiveRoleChange,
}: {
  catalog: CatalogRow[];
  states: Record<CellKey, CellState>;
  editing: boolean;
  changedKeys: Set<string>;
  onChange: (role: AppRoleKey, permission: string, next: CellState) => void;
  isMobile: boolean;
  activeRole: AppRoleKey;
  onActiveRoleChange: (role: AppRoleKey) => void;
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

  if (isMobile) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <Select value={activeRole} onValueChange={(value) => onActiveRoleChange(value as AppRoleKey)}>
          <SelectTrigger aria-label="Chọn vai trò">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_ORDER.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {grouped.map(([module, rows]) => (
          <div key={module} className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-semibold text-text-muted">{module}</h3>
            {rows.map((row) => {
              const key = cellKey(activeRole, row.permission_key);
              const state = states[key] ?? { enabled: false, data_scope: row.allowed_scopes[0]! };
              return (
                <div key={row.permission_key} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{row.label}</span>
                    {row.is_sensitive ? (
                      <Badge variant="warning" size="sm">
                        Nhạy cảm
                      </Badge>
                    ) : null}
                  </div>
                  <Cell
                    catalog={row}
                    state={state}
                    editing={editing}
                    changed={changedKeys.has(key)}
                    label={`${row.label} — ${ROLE_LABEL[activeRole]}`}
                    onChange={(next) => onChange(activeRole, row.permission_key, next)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[260px]">Quyền</TableHead>
            {ROLE_ORDER.map((role) => (
              <TableHead key={role} className="min-w-[180px] whitespace-nowrap text-center">
                {ROLE_LABEL[role]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {catalog.map((row) => (
            <TableRow key={row.permission_key}>
              <TableCell className="min-w-[260px] align-top">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{row.label}</span>
                  <span className="text-xs text-text-muted">
                    {row.module}
                    {row.is_sensitive ? " · Nhạy cảm" : ""}
                  </span>
                </div>
              </TableCell>
              {ROLE_ORDER.map((role) => {
                const key = cellKey(role, row.permission_key);
                const state = states[key] ?? { enabled: false, data_scope: row.allowed_scopes[0]! };
                return (
                  <TableCell key={role} className="align-top">
                    <Cell
                      catalog={row}
                      state={state}
                      editing={editing}
                      changed={changedKeys.has(key)}
                      label={`${row.label} — ${ROLE_LABEL[role]}`}
                      onChange={(next) => onChange(role, row.permission_key, next)}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
