import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ButtonPreview, FormPreview } from "@/components/preview/component-preview";

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

function ThemePreview() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-caption font-semibold tracking-[0.18em] text-text-muted uppercase">
          Nội bộ · M1.1A
        </p>
        <h1 className="mt-2 text-h1">Theme Preview — Forest Command</h1>
        <p className="mt-2 max-w-2xl text-body text-text-secondary">
          Style board kiểm tra design token. Đây không phải dashboard nghiệp vụ.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <Section title="Màu thương hiệu & điểm nhấn" hint="Dùng có chủ đích cho action chính, selected state, focus.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {brand.map((s) => (
              <Swatch key={s.token} {...s} />
            ))}
          </div>
        </Section>

        <Section title="Màu trạng thái nghiệp vụ" hint="Tách biệt hoàn toàn khỏi màu nhận diện thương hiệu.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {states.map((s) => (
              <Swatch key={s.token} {...s} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-badge border border-border-default bg-state-success-surface px-2 py-1 text-caption font-medium text-state-success">
              Hoàn thành
            </span>
            <span className="rounded-badge border border-border-default bg-state-warning-surface px-2 py-1 text-caption font-medium text-state-warning">
              Sắp đến hạn
            </span>
            <span className="rounded-badge border border-border-default bg-state-danger-surface px-2 py-1 text-caption font-medium text-state-danger">
              Quá hạn
            </span>
            <span className="rounded-badge border border-border-default bg-state-info-surface px-2 py-1 text-caption font-medium text-state-info">
              Đang thực hiện
            </span>
            <span className="rounded-badge border border-border-default bg-state-neutral-surface px-2 py-1 text-caption font-medium text-text-muted">
              Chờ xử lý
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
            <p className="text-h2">Heading 2 — Vận hành hằng ngày</p>
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

        <Section title="Khối UI trung tính" hint="Chỉ để cảm nhận tổng thể, không phải component system.">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-card border border-border-default bg-surface p-4 shadow-level-1">
              <p className="text-label text-text-muted">Chỉ số mẫu</p>
              <p className="cen-kpi mt-1 text-text-primary">86%</p>
              <p className="mt-1 text-helper text-state-success">Trong ngưỡng ổn định</p>
            </div>
            <div className="rounded-card border border-border-default bg-surface p-4 shadow-level-1">
              <p className="text-label text-text-muted">Trường nhập</p>
              <input
                readOnly
                value="Giá trị mẫu"
                className="cen-transition mt-2 h-control-md w-full rounded-control border border-border-default bg-background px-3 text-body text-text-primary"
              />
              <p className="mt-2 text-helper text-text-muted">Helper text mẫu</p>
            </div>
            <div className="rounded-card border border-border-default bg-surface p-4 shadow-level-1">
              <p className="text-label text-text-muted">Hành động</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm">Chính</Button>
                <Button size="sm" variant="secondary">
                  Phụ
                </Button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Button component" hint="M1.1B · variant, size, icon, loading, disabled.">
          <ButtonPreview />
        </Section>

        <Section title="Form component" hint="M1.1B · label, helper text, required, error, disabled, read-only.">
          <FormPreview />
        </Section>
      </div>

    </main>
  );
}
