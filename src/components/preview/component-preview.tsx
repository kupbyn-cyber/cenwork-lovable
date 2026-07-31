import * as React from "react";
import { ArrowRight, Plus, Search, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ControlRow, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-default bg-surface p-4">
      <p className="mb-3 text-caption font-semibold tracking-wide text-text-muted uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

export function ButtonPreview() {
  const [loading, setLoading] = React.useState(true);

  return (
    <div className="flex flex-col gap-4">
      <Block title="Variant">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </Block>

      <Block title="Size">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Nhỏ</Button>
          <Button size="md">Vừa</Button>
          <Button size="lg">Lớn</Button>
        </div>
      </Block>

      <Block title="Icon">
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <Plus />
            Icon trái
          </Button>
          <Button variant="secondary">
            Icon phải
            <ArrowRight />
          </Button>
          <IconButton label="Tìm kiếm" variant="outline">
            <Search />
          </IconButton>
          <IconButton label="Xóa nội dung" variant="destructive">
            <Trash2 />
          </IconButton>
        </div>
      </Block>

      <Block title="Trạng thái">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled phụ
          </Button>
          <Button loading={loading}>Đang xử lý</Button>
          <Button variant="outline" onClick={() => setLoading((v) => !v)}>
            {loading ? "Tắt loading" : "Bật loading"}
          </Button>
        </div>
        <p className="mt-3 text-helper text-text-muted">
          Loading giữ nguyên kích thước button và chặn thao tác lặp lại.
        </p>
      </Block>

      <Block title="Full width (mobile)">
        <Button fullWidth>Hành động chính</Button>
      </Block>
    </div>
  );
}

export function FormPreview() {
  const [checked, setChecked] = React.useState(true);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Block title="Input">
        <div className="flex flex-col gap-4">
          <FormField id="f-default" label="Tên nội dung">
            {(p) => <Input placeholder="Nhập thông tin" {...p} />}
          </FormField>
          <FormField id="f-filled" label="Tên nội dung" helperText="Đã có giá trị mẫu">
            {(p) => <Input defaultValue="Giá trị mẫu" {...p} />}
          </FormField>
          <FormField id="f-required" label="Tên nội dung" required helperText="Nhập thông tin ngắn gọn">
            {(p) => <Input placeholder="Nhập thông tin" {...p} />}
          </FormField>
        </div>
      </Block>

      <Block title="Trạng thái đặc biệt">
        <div className="flex flex-col gap-4">
          <FormField id="f-error" label="Tên nội dung" required error="Trường này là bắt buộc">
            {(p) => <Input placeholder="Nhập thông tin" {...p} />}
          </FormField>
          <FormField id="f-disabled" label="Tên nội dung" helperText="Không thể chỉnh sửa">
            {(p) => <Input defaultValue="Giá trị mẫu" disabled {...p} />}
          </FormField>
          <FormField id="f-readonly" label="Tên nội dung" helperText="Chỉ đọc, vẫn focus được">
            {(p) => <Input defaultValue="Giá trị mẫu" readOnly {...p} />}
          </FormField>
        </div>
      </Block>

      <Block title="Password & Textarea">
        <div className="flex flex-col gap-4">
          <FormField id="f-pass" label="Mật khẩu mẫu" helperText="Chỉ minh họa ẩn / hiện nội dung">
            {(p) => <PasswordInput placeholder="Nhập thông tin" {...p} />}
          </FormField>
          <FormField id="f-textarea" label="Mô tả mẫu" helperText="Nội dung dài không bị tràn">
            {(p) => <Textarea rows={3} placeholder="Nhập thông tin" {...p} />}
          </FormField>
        </div>
      </Block>

      <Block title="Select">
        <div className="flex flex-col gap-4">
          <FormField id="f-select" label="Lựa chọn mẫu" required>
            {(p) => (
              <Select>
                <SelectTrigger id={p.id} aria-describedby={p["aria-describedby"]}>
                  <SelectValue placeholder="Chọn một giá trị" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Lựa chọn mẫu A</SelectItem>
                  <SelectItem value="b">Lựa chọn mẫu B</SelectItem>
                  <SelectItem value="c" disabled>
                    Lựa chọn mẫu C (disabled)
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="f-select-err" label="Lựa chọn mẫu" error="Trường này là bắt buộc">
            {(p) => (
              <Select>
                <SelectTrigger id={p.id} aria-invalid={p["aria-invalid"]} aria-describedby={p["aria-describedby"]}>
                  <SelectValue placeholder="Chọn một giá trị" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Lựa chọn mẫu A</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="f-select-dis" label="Lựa chọn mẫu" helperText="Disabled">
            {(p) => (
              <Select disabled>
                <SelectTrigger id={p.id} aria-describedby={p["aria-describedby"]}>
                  <SelectValue placeholder="Chọn một giá trị" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Lựa chọn mẫu A</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
      </Block>

      <Block title="Checkbox & Radio">
        <div className="flex flex-col gap-1">
          <ControlRow
            htmlFor="cb-1"
            label="Lựa chọn mẫu 1"
            description="Có thể chọn nhiều"
            control={
              <Checkbox
                id="cb-1"
                checked={checked}
                onCheckedChange={(v) => setChecked(v === true)}
              />
            }
          />
          <ControlRow htmlFor="cb-2" label="Lựa chọn mẫu 2" control={<Checkbox id="cb-2" />} />
          <ControlRow
            htmlFor="cb-3"
            label="Lựa chọn mẫu 3 (disabled)"
            control={<Checkbox id="cb-3" disabled />}
          />
          <RadioGroup defaultValue="r1" className="mt-2 gap-1">
            <ControlRow htmlFor="r1" label="Lựa chọn mẫu A" control={<RadioGroupItem id="r1" value="r1" />} />
            <ControlRow htmlFor="r2" label="Lựa chọn mẫu B" control={<RadioGroupItem id="r2" value="r2" />} />
            <ControlRow
              htmlFor="r3"
              label="Lựa chọn mẫu C (disabled)"
              control={<RadioGroupItem id="r3" value="r3" disabled />}
            />
          </RadioGroup>
        </div>
      </Block>

      <Block title="Switch">
        <div className="flex flex-col gap-1">
          <ControlRow
            htmlFor="sw-1"
            label="Tùy chọn mẫu"
            description="Component nền, chưa gắn business rule"
            control={<Switch id="sw-1" defaultChecked />}
          />
          <ControlRow htmlFor="sw-2" label="Tùy chọn mẫu tắt" control={<Switch id="sw-2" />} />
          <ControlRow
            htmlFor="sw-3"
            label="Tùy chọn mẫu disabled"
            control={<Switch id="sw-3" disabled />}
          />
        </div>
      </Block>
    </div>
  );
}
