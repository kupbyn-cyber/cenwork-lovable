import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/app-shell";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-caption font-semibold tracking-[0.18em] text-text-muted uppercase">404</p>
        <h1 className="mt-3 text-h2 text-text-primary">Không tìm thấy trang</h1>
        <p className="mt-2 text-body text-text-secondary">
          Đường dẫn không tồn tại hoặc đã được di chuyển.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="cen-transition inline-flex h-control-md items-center justify-center rounded-control bg-brand-primary px-4 text-label font-semibold text-brand-foreground hover:bg-brand-primary-hover"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-h3 text-text-primary">Trang không tải được</h1>
        <p className="mt-2 text-body text-text-secondary">
          Đã có lỗi xảy ra. Bạn có thể thử lại hoặc quay về trang chủ.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="cen-transition inline-flex h-control-md items-center justify-center rounded-control bg-brand-primary px-4 text-label font-semibold text-brand-foreground hover:bg-brand-primary-hover"
          >
            Thử lại
          </button>
          <a
            href="/"
            className="cen-transition inline-flex h-control-md items-center justify-center rounded-control border border-border-strong bg-surface px-4 text-label font-medium text-text-primary hover:bg-surface-subtle"
          >
            Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CEN 1.0 — Theme Foundation" },
      {
        name: "description",
        content: "Nền giao diện CEN 1.0 theo phong cách Forest Command: dark mode duy nhất, design token tập trung.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "CEN 1.0 — Theme Foundation" },
      { name: "twitter:title", content: "CEN 1.0 — Theme Foundation" },
      { property: "og:description", content: "Nền giao diện CEN 1.0 theo phong cách Forest Command: dark mode duy nhất, design token tập trung." },
      { name: "twitter:description", content: "Nền giao diện CEN 1.0 theo phong cách Forest Command: dark mode duy nhất, design token tập trung." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ddff4671-603a-4f94-98aa-c60fff2cafe9" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ddff4671-603a-4f94-98aa-c60fff2cafe9" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200} skipDelayDuration={300}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
