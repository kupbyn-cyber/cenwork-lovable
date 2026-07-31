"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Avatar (M1.1C)
 * Presentational only: image / initials / fallback via props.
 */
const avatarVariants = cva(
  "relative inline-flex shrink-0 overflow-hidden rounded-full border border-border-default bg-surface-subtle select-none",
  {
    variants: {
      size: {
        xs: "size-6 text-caption",
        sm: "size-8 text-helper",
        md: "size-10 text-label",
        lg: "size-12 text-body",
      },
    },
    defaultVariants: { size: "md" },
  },
);

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & VariantProps<typeof avatarVariants>
>(({ className, size, ...props }, ref) => (
  <AvatarPrimitive.Root ref={ref} className={cn(avatarVariants({ size }), className)} {...props} />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square size-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex size-full items-center justify-center bg-surface-subtle font-medium uppercase text-text-secondary",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

function initialsFrom(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`;
}

export interface EntityAvatarProps
  extends Omit<React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>, "children">,
    VariantProps<typeof avatarVariants> {
  /** Accessible name / source of initials. Never hardcoded inside the component. */
  name: string;
  /** Optional image URL. Falls back to initials when missing or when loading fails. */
  src?: string;
  /** Explicit initials override. */
  initials?: string;
  /** Fallback node used when there is no image and no usable initials. */
  fallback?: React.ReactNode;
}

/** Convenience wrapper: image → initials → fallback, with an accessible name. */
const EntityAvatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  EntityAvatarProps
>(({ name, src, initials, fallback, size, className, ...props }, ref) => {
  const text = (initials ?? initialsFrom(name)).slice(0, 2);
  return (
    <Avatar ref={ref} size={size} className={className} {...props}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback aria-hidden="true">{fallback ?? text}</AvatarFallback>
      <span className="sr-only">{name}</span>
    </Avatar>
  );
});
EntityAvatar.displayName = "EntityAvatar";

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Overflow count rendered as a trailing "+N" chip. */
  overflow?: number;
  size?: VariantProps<typeof avatarVariants>["size"];
}

/** Purely visual stack of avatars. No membership logic. */
const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, children, overflow, size = "sm", ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center -space-x-2 [&>*]:ring-2 [&>*]:ring-surface", className)}
      {...props}
    >
      {children}
      {overflow && overflow > 0 ? (
        <span
          className={cn(
            avatarVariants({ size }),
            "items-center justify-center bg-surface-subtle font-medium text-text-secondary",
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  ),
);
AvatarGroup.displayName = "AvatarGroup";

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, EntityAvatar, avatarVariants };
