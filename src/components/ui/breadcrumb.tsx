import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & { separator?: React.ReactNode }
>(({ className, ...props }, ref) => (
  <nav ref={ref} aria-label="breadcrumb" className={cn("min-w-0", className)} {...props} />
));
Breadcrumb.displayName = "Breadcrumb";

const BreadcrumbList = React.forwardRef<HTMLOListElement, React.ComponentPropsWithoutRef<"ol">>(
  ({ className, ...props }, ref) => (
    <ol
      ref={ref}
      className={cn(
        "flex min-w-0 flex-nowrap items-center gap-1.5 text-helper text-text-muted",
        className,
      )}
      {...props}
    />
  ),
);
BreadcrumbList.displayName = "BreadcrumbList";

const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<"li">>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      {...props}
    />
  ),
);
BreadcrumbItem.displayName = "BreadcrumbItem";

const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a"> & { asChild?: boolean }
>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      ref={ref}
      className={cn(
        "cen-transition max-w-[12ch] truncate rounded-badge hover:text-text-primary sm:max-w-[24ch]",
        className,
      )}
      {...props}
    />
  );
});
BreadcrumbLink.displayName = "BreadcrumbLink";

const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn(
        "max-w-[16ch] truncate font-medium text-text-primary sm:max-w-[32ch]",
        className,
      )}
      {...props}
    />
  ),
);
BreadcrumbPage.displayName = "BreadcrumbPage";

const BreadcrumbSeparator = ({ children, className, ...props }: React.ComponentProps<"li">) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn("shrink-0 text-text-disabled [&>svg]:size-3.5", className)}
    {...props}
  >
    {children ?? <ChevronRight />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

const BreadcrumbEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn("flex size-5 shrink-0 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="size-icon-md" />
    <span className="sr-only">More</span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis";

export interface BreadcrumbItemData {
  label: string;
  /** Optional href. Omit for non-navigable ancestors. */
  href?: string;
  /** Optional custom renderer (e.g. router Link) — receives label as children. */
  render?: (props: { children: React.ReactNode }) => React.ReactNode;
}

export interface BreadcrumbNavProps extends React.ComponentPropsWithoutRef<"nav"> {
  items: BreadcrumbItemData[];
  /** Collapse middle items when the list is longer than this. Default 4. */
  maxItems?: number;
}

/**
 * CEN 1.0 — BreadcrumbNav (M1.1C)
 * Data-driven breadcrumb. No routing logic of its own.
 */
const BreadcrumbNav = React.forwardRef<HTMLElement, BreadcrumbNavProps>(
  ({ items, maxItems = 4, className, ...props }, ref) => {
    const collapsed = items.length > maxItems;
    const visible: (BreadcrumbItemData | "ellipsis")[] = collapsed
      ? [items[0]!, "ellipsis", ...items.slice(-2)]
      : items;

    return (
      <Breadcrumb ref={ref} className={className} {...props}>
        <BreadcrumbList>
          {visible.map((item, index) => {
            const isLast = index === visible.length - 1;
            return (
              <React.Fragment key={item === "ellipsis" ? "ellipsis" : `${item.label}-${index}`}>
                <BreadcrumbItem>
                  {item === "ellipsis" ? (
                    <BreadcrumbEllipsis />
                  ) : isLast ? (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  ) : item.render ? (
                    <BreadcrumbLink asChild>{item.render({ children: item.label })}</BreadcrumbLink>
                  ) : item.href ? (
                    <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                  ) : (
                    <span className="max-w-[12ch] truncate sm:max-w-[24ch]">{item.label}</span>
                  )}
                </BreadcrumbItem>
                {isLast ? null : <BreadcrumbSeparator />}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  },
);
BreadcrumbNav.displayName = "BreadcrumbNav";

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
  BreadcrumbNav,
};
