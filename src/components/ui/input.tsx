import * as React from "react";

import { cn } from "@/lib/utils";

export const controlBaseClass =
  "w-full rounded-control border border-border-default bg-background text-text-primary cen-transition placeholder:text-text-disabled hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring focus-visible:border-focus-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-subtle disabled:text-text-disabled read-only:bg-surface-subtle read-only:text-text-secondary read-only:hover:border-border-default aria-invalid:border-state-danger aria-invalid:focus-visible:outline-state-danger";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(controlBaseClass, "h-control-md px-3 text-body", className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
