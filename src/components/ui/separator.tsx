import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-border-default",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px self-stretch",
      className,
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export interface DividerProps extends React.ComponentPropsWithoutRef<typeof Separator> {
  /** Optional label rendered in the middle of a horizontal divider. */
  label?: React.ReactNode;
}

/**
 * CEN 1.0 — Divider (M1.1C)
 * Thin rule using the border token. Optional label for horizontal orientation.
 */
const Divider = React.forwardRef<React.ElementRef<typeof Separator>, DividerProps>(
  ({ label, className, orientation = "horizontal", ...props }, ref) => {
    if (!label || orientation === "vertical") {
      return <Separator ref={ref} orientation={orientation} className={className} {...props} />;
    }
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <Separator ref={ref} className="flex-1" {...props} />
        <span className="shrink-0 text-caption font-medium uppercase tracking-wide text-text-muted">
          {label}
        </span>
        <Separator className="flex-1" aria-hidden="true" />
      </div>
    );
  },
);
Divider.displayName = "Divider";

export { Separator, Divider };
