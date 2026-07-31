import * as React from "react";

import { cn } from "@/lib/utils";
import { controlBaseClass } from "@/components/ui/input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          controlBaseClass,
          "min-h-20 resize-y px-3 py-2 text-body break-words",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
