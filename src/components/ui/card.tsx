import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Card (M1.1C)
 * Near-flat, thin border, soft shadow, radius token `card`. No glow.
 * Density is a prop — do not fork the card for small padding differences.
 */
const cardVariants = cva(
  "cen-transition rounded-card border border-border-default bg-surface text-text-primary shadow-level-1",
  {
    variants: {
      density: {
        compact: "[--card-pad:0.75rem]",
        default: "[--card-pad:1rem]",
        relaxed: "[--card-pad:1.5rem]",
      },
      interactive: {
        true: "cursor-pointer hover:border-border-strong hover:bg-surface-subtle hover:shadow-level-2 focus-visible:border-border-strong",
        false: "",
      },
    },
    defaultVariants: { density: "default", interactive: false },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, density, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ density, interactive }), className)} {...props} />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-(--card-pad)",
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

/** Action slot in the card header. Content is always passed in from outside. */
const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex shrink-0 items-center gap-2", className)} {...props} />
  ),
);
CardAction.displayName = "CardAction";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("min-w-0 text-h4 font-semibold text-text-primary", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("mt-1 text-helper text-text-muted", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("p-(--card-pad) text-body text-text-secondary [&:not(:first-child)]:pt-0", className)}
      {...props}
    />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-border-default p-(--card-pad)",
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardAction,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
};
