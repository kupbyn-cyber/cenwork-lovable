import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

/**
 * CEN 1.0 — Tabs (M1.1C)
 * Presentation only. Value/onValueChange are controlled from outside.
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex w-max min-w-full items-center gap-1 rounded-control border border-border-default bg-background-elevated p-1 text-text-muted",
        className,
      )}
      {...props}
    />
  </div>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "cen-transition inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-badge px-3 text-label font-medium",
      "hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      "disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:text-text-disabled",
      "data-[state=active]:bg-brand-primary data-[state=active]:text-brand-foreground",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
