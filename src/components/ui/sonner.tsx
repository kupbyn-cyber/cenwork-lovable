import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * CEN 1.0 — Toaster mount (M1.1D). Dùng cùng helper `cenToast` trong ui/toast.tsx.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "group toast pointer-events-auto w-full max-w-[calc(100vw-2rem)] gap-2 rounded-card border border-border-default bg-background-elevated p-3 text-text-primary shadow-level-3",
          title: "text-label font-semibold text-text-primary",
          description: "text-helper text-text-muted",
          actionButton: "rounded-control bg-brand-primary px-2 py-1 text-caption text-brand-foreground",
          cancelButton: "rounded-control bg-surface-subtle px-2 py-1 text-caption text-text-secondary",
          closeButton:
            "border-border-default bg-surface text-text-muted hover:text-text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
