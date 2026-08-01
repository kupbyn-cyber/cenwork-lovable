import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium cursor-pointer cen-transition cen-press-subtle select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:pointer-events-none aria-disabled:opacity-70 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-primary text-brand-foreground border border-brand-primary hover:bg-brand-primary-hover active:bg-brand-secondary shadow-level-1",
        secondary:
          "bg-surface-subtle text-text-primary border border-border-default hover:border-border-strong hover:bg-surface active:bg-surface-subtle",
        outline:
          "bg-transparent text-text-secondary border border-border-strong hover:bg-surface hover:text-text-primary active:bg-surface-subtle",
        ghost:
          "bg-transparent text-text-secondary border border-transparent hover:bg-surface-subtle hover:text-text-primary active:bg-surface",
        destructive:
          "bg-state-danger text-text-primary border border-state-danger hover:opacity-90 active:opacity-100 shadow-level-1",
      },
      size: {
        sm: "h-control-sm px-2.5 text-caption [&_svg]:size-icon-sm",
        md: "h-control-md px-3.5 text-label [&_svg]:size-icon-md",
        lg: "h-control-lg px-4 text-body [&_svg]:size-icon-md",
        "icon-sm": "h-control-sm w-control-sm p-0 [&_svg]:size-icon-sm",
        icon: "h-control-md w-control-md p-0 [&_svg]:size-icon-md",
        "icon-lg": "h-control-lg w-control-lg p-0 [&_svg]:size-icon-lg",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Hiển thị spinner, chặn thao tác lặp lại, không đổi kích thước button. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, fullWidth, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading ? "true" : undefined}
        {...props}
      >
        {loading ? (
          <span
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden={false}
            role="status"
          >
            <Loader2 className="animate-spin" />
            <span className="sr-only">Đang xử lý</span>
          </span>
        ) : null}
        <span
          className={cn(
            "inline-flex items-center justify-center gap-2",
            loading && "invisible",
          )}
        >
          {children}
        </span>
      </button>
    );
  },
);
Button.displayName = "Button";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "fullWidth"> {
  /** Bắt buộc: accessible label cho button chỉ có icon. */
  label: string;
  size?: "icon-sm" | "icon" | "icon-lg";
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = "icon", className, ...props }, ref) => (
    <Button
      ref={ref}
      size={size}
      aria-label={label}
      title={label}
      className={cn("min-h-11 min-w-11 sm:min-h-0 sm:min-w-0", className)}
      {...props}
    />
  ),
);
IconButton.displayName = "IconButton";

export { Button, IconButton, buttonVariants };
