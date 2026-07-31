import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CEN 1.0 — Theme Foundation" },
      {
        name: "description",
        content:
          "Nền giao diện CEN 1.0 theo phong cách Forest Command: dark mode duy nhất, design token tập trung.",
      },
      { property: "og:title", content: "CEN 1.0 — Theme Foundation" },
      {
        property: "og:description",
        content: "Design token tập trung và dark theme Forest Command cho CEN 1.0.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-caption font-semibold tracking-[0.18em] text-text-muted uppercase">
        CEN 1.0 — M1.1A
      </p>
      <h1 className="text-h1 text-text-primary">Theme Foundation — Forest Command</h1>
      <p className="text-body-lg max-w-xl text-text-secondary">
        Hệ design token tập trung, dark mode duy nhất, palette CEN và các quy tắc hình khối đã được
        chuẩn hóa. Mở trang preview nội bộ để rà soát trực quan.
      </p>
      <div>
        <Link
          to="/theme-preview"
          className="cen-transition inline-flex h-control-lg items-center rounded-control border border-border-strong bg-brand-primary px-4 text-label font-semibold text-brand-foreground shadow-level-1 hover:bg-brand-primary-hover"
        >
          Mở Theme Preview
        </Link>
      </div>
    </main>
  );
}
