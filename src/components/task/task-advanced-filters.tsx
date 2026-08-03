import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_ORDER } from "@/lib/task-data";
import {
  ALL,
  TASK_KIND_LABEL,
  countAdvancedFilters,
  type TaskFilterState,
  type TaskKindFilter,
} from "@/lib/task-view-data";

/**
 * CEN 1.0 — Bộ lọc nâng cao của trang Công việc.
 * Chỉ lọc trên dữ liệu người dùng đã được phép xem; không mở rộng phạm vi.
 */
export interface TaskAdvancedFiltersProps {
  filters: TaskFilterState;
  onChange: (patch: Partial<TaskFilterState>) => void;
  people: { id: string; display_name: string }[];
}

const KIND_ORDER: TaskKindFilter[] = [
  "all",
  "project",
  "standalone",
  "with_deadline",
  "no_deadline",
  "overdue",
];

function Body({ filters, onChange, people }: TaskAdvancedFiltersProps) {
  const toggle = (key: "mine" | "createdByMe" | "needsMe") => (value: boolean | string) =>
    onChange({ [key]: value === true } as Partial<TaskFilterState>);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Mức ưu tiên</Label>
          <MultiSelect
            placeholder="Mức ưu tiên"
            ariaLabel="Lọc theo mức ưu tiên"
            value={filters.priority}
            onChange={(value) => onChange({ priority: value })}
            options={TASK_PRIORITY_ORDER.map((priority) => ({
              value: priority,
              label: TASK_PRIORITY_LABEL[priority],
            }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Loại công việc</Label>
          <Select
            value={filters.kind}
            onValueChange={(value) => onChange({ kind: value as TaskKindFilter })}
          >
            <SelectTrigger aria-label="Lọc theo loại công việc">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_ORDER.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {TASK_KIND_LABEL[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deadline-from">Deadline từ ngày</Label>
          <Input
            id="deadline-from"
            type="date"
            value={filters.deadlineFrom}
            onChange={(event) => onChange({ deadlineFrom: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deadline-to">Deadline đến ngày</Label>
          <Input
            id="deadline-to"
            type="date"
            value={filters.deadlineTo}
            onChange={(event) => onChange({ deadlineTo: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="created-from">Ngày tạo từ ngày</Label>
          <Input
            id="created-from"
            type="date"
            value={filters.createdFrom}
            onChange={(event) => onChange({ createdFrom: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="created-to">Ngày tạo đến ngày</Label>
          <Input
            id="created-to"
            type="date"
            value={filters.createdTo}
            onChange={(event) => onChange({ createdTo: event.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Người tạo</Label>
        <Select value={filters.creator} onValueChange={(value) => onChange({ creator: value })}>
          <SelectTrigger aria-label="Lọc theo người tạo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả người tạo</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="flex flex-col gap-2.5">
        <label className="flex items-center gap-2 text-body-sm text-text-secondary">
          <Checkbox checked={filters.mine} onCheckedChange={toggle("mine")} />
          Công việc tôi phụ trách
        </label>
        <label className="flex items-center gap-2 text-body-sm text-text-secondary">
          <Checkbox checked={filters.createdByMe} onCheckedChange={toggle("createdByMe")} />
          Công việc tôi tạo
        </label>
        <label className="flex items-center gap-2 text-body-sm text-text-secondary">
          <Checkbox checked={filters.needsMe} onCheckedChange={toggle("needsMe")} />
          Công việc cần tôi xử lý
        </label>
      </div>
    </div>
  );
}

export function TaskAdvancedFilters(props: TaskAdvancedFiltersProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const count = countAdvancedFilters(props.filters);

  const trigger = (
    <Button variant="outline" size="sm" onClick={isMobile ? () => setOpen(true) : undefined}>
      <SlidersHorizontal />
      Bộ lọc nâng cao
      {count > 0 ? (
        <span className="ml-1 rounded-full bg-surface-raised px-1.5 text-caption">{count}</span>
      ) : null}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Bộ lọc nâng cao</SheetTitle>
            </SheetHeader>
            <div className="p-4 pt-0">
              <Body {...props} />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-w-[92vw] p-4">
        <Body {...props} />
      </PopoverContent>
    </Popover>
  );
}
