import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type PasswordInputProps = Omit<React.ComponentProps<"input">, "type">;

/** Input mật khẩu thuần UI: chỉ ẩn/hiện nội dung, không xác thực, không gọi API. */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const Icon = visible ? EyeOff : Eye;
    const label = visible ? "Ẩn nội dung" : "Hiện nội dung";

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          disabled={disabled}
          className={cn("pr-11", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={label}
          aria-pressed={visible}
          title={label}
          className="cen-transition absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-control text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon className="size-icon-md" />
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
