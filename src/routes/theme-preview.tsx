import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ButtonPreview, FormPreview } from "@/components/preview/component-preview";
import { OverlayPreview, StatePreview } from "@/components/preview/overlay-preview";
import {
  BadgeAvatarPreview,
  CardPreview,
  StructurePreview,
  TablePreview,
} from "@/components/preview/data-display-preview";

export const Route = createFileRoute("/theme-preview")({
  head: () => ({
    meta: [
      { title: "Theme Preview — CEN 1.0 Design Tokens" },
      {
        name: "description",
        content:
          "Style board nội bộ kiểm tra design token CEN 1.0: màu, chữ, spacing, radius, border, shadow.",
      },
      { property: "og:title", content: "Theme Preview — CEN 1.0 Design Tokens" },
      {
        property: "og:description",
        content: "Bảng kiểm tra trực quan hệ token dark theme Forest Command.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThemePreview,
});

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-container border border-border-default bg-background-elevated p-5 shadow-level-1 sm:p-6">
      <header className="mb-5">
        <h2 className="text-h3">{title}</h2>
        {hint ? <p className="mt-1 text-helper text-text-muted">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Swatch({ name, token, className }: { name: string; token: string; className: string }) {
  return (
    <div className="rounded-card border border-border-default bg-surface p-3">
      <div className={`h-12 w-full rounded-badge border border-border-default ${className}`} />
      <p className="mt-2 text-label font-medium text-text-primary">{name}</p>
      <p className="text-caption text-text-muted">{token}</p>
    </div>
  );
}

const brand = [
  { name: "Brand primary", token: "brand-primary", className: "bg-brand-primary" },
  { name: "Brand secondary", token: "brand-secondary", className: "bg-brand-secondary" },
  { name: "Brand subtle", token: "brand-subtle", className: "bg-brand-subtle" },
  { name: "Accent vàng", token: "accent-yellow", className: "bg-accent-yellow" },
  { name: "Accent cam", token: "accent-orange", className: "bg-accent-orange" },
  { name: "Focus ring", token: "focus-ring", className: "bg-focus-ring" },
];

const states = [
  { name: "Hoàn thành", token: "state-success", className: "bg-state-success" },
  { name: "Sắp đến hạn", token: "state-warning", className: "bg-state-warning" },
  { name: "Quá hạn", token: "state-danger", className: "bg-state-danger" },
  { name: "Đang thực hiện", token: "state-progress", className: "bg-state-progress" },
  { name: "Thông tin", token: "state-info", className: "bg-state-info" },
  { name: "Chờ xử lý", token: "state-neutral", className: "bg-state-neutral" },
];

const surfaces = [
  { name: "Background base", token: "background", className: "bg-background" },
  { name: "Background elevated", token: "background-elevated", className: "bg-background-elevated" },
  { name: "Surface", token: "surface", className: "bg-surface" },
  { name: "Surface subtle", token: "surface-subtle", className: "bg-surface-subtle" },
];

const spacings = [
  { name: "space-1", value: "4px", w: "w-1" },
  { name: "space-2", value: "8px", w: "w-2" },
  { name: "space-3", value: "12px", w: "w-3" },
  { name: "space-4", value: "16px", w: "w-4" },
  { name: "space-6", value: "24px", w: "w-6" },
  { name: "space-8", value: "32px", w: "w-8" },
  { name: "space-12", value: "48px", w: "w-12" },
];

const radii = [
  { name: "badge", value: "6px", cls: "rounded-badge" },
  { name: "control", value: "8px", cls: "rounded-control" },
  { name: "card", value: "10px", cls: "rounded-card" },
  { name: "container", value: "12px", cls: "rounded-container" },
];

const groups = [
  { id: "foundation", label: "1 · Foundation" },
  { id: "actions", label: "2 · Actions và Forms" },
  { id: "data-display", label: "3 · Data Display" },
  { id: "structure", label: "4 · Structure" },
  { id: "overlay", label: "5 · Overlay và Feedback" },
  { id: "system-state", label: "6 · Loading, Empty và Error" },
];

function Group({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <div className="mb-4 border-l-2 border-brand-primary pl-3">
        <h2 id={`${id}-title`} className="text-h2">
          {title}
        </h2>
        <p className="mt-1 text-helper text-text-muted">{hint}</p>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function ThemePreview() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-caption font-semibold tracking-[0.18em] text-text-muted uppercase">
          Nội bộ · M1.1
        </p>
        <h1 className="mt-2 text-h1">Design System CEN — Forest Command</h1>
        <p className="mt-2 max-w-2xl text-body text-text-secondary">
          Showcase kiểm tra token và component nền. Đây không phải dashboard nghiệp vụ.
        </p>
      </header>

      <nav
        aria-label="Nhóm component"
        className="sticky top-0 z-30 -mx-4 mb-8 overflow-x-auto border-b border-border-default bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <ul className="flex w-max min-w-full gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <a
                href={`#${g.id}`}
                className="cen-transition inline-flex h-control-lg items-center rounded-control border border-border-default bg-surface px-3 sm:h-control-md text-label whitespace-nowrap text-text-secondary hover:bg-surface-subtle hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
              >
                {g.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-12">
        <Group id="foundation" title="Foundation" hint="M1.1A · màu, typography, spacing, radius, border, shadow.">
          <Section title="Màu thương hiệu & điểm nhấn" hint="Dùng có chủ đích cho action chính, selected state, focus.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {brand.map((s) => (
                <Swatch key={s.token} {...s} />
              ))}
            </div>
          </Section>

          <Section title="Màu trạng thái" hint="Tách biệt hoàn toàn khỏi màu nhận diện thương hiệu.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {states.map((s) => (
                <Swatch key={s.token} {...s} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-badge border border-border-default bg-state-success-surface px-2 py-1 text-caption font-medium text-state-success">
                Trạng thái A
              </span>
              <span className="rounded-badge border border-border-default bg-state-warning-surface px-2 py-1 text-caption font-medium text-state-warning">
                Trạng thái B
              </span>
              <span className="rounded-badge border border-border-default bg-state-danger-surface px-2 py-1 text-caption font-medium text-state-danger">
                Trạng thái C
              </span>
              <span className="rounded-badge border border-border-default bg-state-info-surface px-2 py-1 text-caption font-medium text-state-info">
                Trạng thái D
              </span>
              <span className="rounded-badge border border-border-default bg-state-neutral-surface px-2 py-1 text-caption font-medium text-text-muted">
                Trạng thái E
              </span>
            </div>
          </Section>

          <Section title="Phân tầng nền" hint="Phân biệt bằng độ sáng, border mảnh và shadow nhẹ.">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {surfaces.map((s) => (
                <Swatch key={s.token} {...s} />
              ))}
            </div>
            <div className="mt-4 rounded-container border border-border-default bg-background p-4">
              <p className="text-label text-text-muted">Layer 1 · background</p>
              <div className="mt-3 rounded-card border border-border-default bg-surface p-4 shadow-level-1">
                <p className="text-label text-text-muted">Layer 2 · surface</p>
                <div className="mt-3 rounded-card border border-border-strong bg-surface-subtle p-4 shadow-level-2">
                  <p className="text-label text-text-muted">Layer 3 · surface subtle</p>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Typography" hint="Inter · heading 600, body 400–500, KPI 600–700.">
            <div className="flex flex-col gap-3">
              <p className="text-h1">Heading 1 — Trung tâm điều hành</p>
              <p className="text-h2">Heading 2 — Nhóm nội dung</p>
              <p className="text-h3">Heading 3 — Nhóm chỉ số</p>
              <p className="text-h4">Heading 4 — Mục con</p>
              <p className="text-body-lg text-text-secondary">Body large — nội dung mô tả chính.</p>
              <p className="text-body text-text-secondary">Body — nội dung mặc định của hệ thống.</p>
              <p className="text-label font-medium text-text-primary">Label — nhãn trường dữ liệu</p>
              <p className="text-helper text-text-muted">Helper text — chú thích hỗ trợ nhập liệu</p>
              <p className="text-caption tracking-wide text-text-muted uppercase">Caption</p>
              <p className="cen-kpi text-text-primary">1.248</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <p className="text-body text-text-primary">Text primary</p>
              <p className="text-body text-text-secondary">Text secondary</p>
              <p className="text-body text-text-muted">Text muted</p>
              <p className="text-body text-text-disabled">Text disabled</p>
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Spacing scale">
              <div className="flex flex-col gap-2">
                {spacings.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-caption text-text-muted">{s.name}</span>
                    <span className={`h-3 ${s.w} rounded-badge bg-brand-primary`} />
                    <span className="text-caption text-text-muted">{s.value}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Radius & Border">
              <div className="grid grid-cols-2 gap-3">
                {radii.map((r) => (
                  <div
                    key={r.name}
                    className={`${r.cls} border border-border-default bg-surface p-4 text-center`}
                  >
                    <p className="text-label text-text-primary">{r.name}</p>
                    <p className="text-caption text-text-muted">{r.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-card border border-border-default bg-surface p-4 text-label text-text-secondary">
                  border default
                </div>
                <div className="rounded-card border border-border-strong bg-surface p-4 text-label text-text-secondary">
                  border strong
                </div>
              </div>
            </Section>
          </div>

          <Section title="Shadow" hint="Mềm, blur thấp, không glow.">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-card border border-border-default bg-surface p-5 text-label shadow-level-1">
                level 1
              </div>
              <div className="rounded-card border border-border-default bg-surface p-5 text-label shadow-level-2">
                level 2
              </div>
              <div className="rounded-card border border-border-default bg-surface p-5 text-label shadow-level-3">
                level 3
              </div>
            </div>
          </Section>
        </Group>

        <Group id="actions" title="Actions và Forms" hint="M1.1B · button, icon button, input, select, checkbox, radio, switch.">
          <Section title="Button" hint="Variant, size, icon, loading, disabled, full width.">
            <ButtonPreview />
          </Section>
          <Section title="Form" hint="Label, helper text, required, error, disabled, read-only.">
            <FormPreview />
          </Section>
        </Group>

        <Group id="data-display" title="Data Display" hint="M1.1C · badge, status badge, avatar, card, table.">
          <Section title="Badge và Avatar" hint="Badge variant, status badge, avatar và fallback.">
            <BadgeAvatarPreview />
          </Section>
          <Section title="Card" hint="Header, action, footer, density, hover.">
            <CardPreview />
          </Section>
          <Section title="Table nền" hint="Header, row, cell, hover, selected, action column, cuộn ngang trong vùng bảng.">
            <TablePreview />
          </Section>
        </Group>

        <Group id="structure" title="Structure" hint="M1.1C · page header, section header, tabs, breadcrumb, divider.">
          <Section title="Structure component" hint="Tabs dài chỉ cuộn trong vùng tabs; action của page header tự xuống dòng.">
            <StructurePreview />
          </Section>
        </Group>

        <Group id="overlay" title="Overlay và Feedback" hint="M1.1D · modal, confirmation, drawer, dropdown, tooltip, toast.">
          <Section title="Overlay và feedback" hint="Giữ nguyên keyboard behavior của primitive: ESC, focus trap, phím mũi tên.">
            <OverlayPreview />
          </Section>
        </Group>

        <Group id="system-state" title="Loading, Empty và Error" hint="M1.1D · spinner, skeleton, empty state, error state và tích hợp vào Table/Card.">
          <Section title="System state" hint="Empty và Error tách biệt rõ: empty là không có dữ liệu, error kèm hành động thử lại.">
            <StatePreview />
          </Section>
        </Group>
      </div>
    </main>
  );
}

