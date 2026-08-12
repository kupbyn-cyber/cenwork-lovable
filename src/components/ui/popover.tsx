import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * Popover được portal ra ngoài Dialog. Khi Dialog bật scroll-lock
 * (react-remove-scroll), sự kiện wheel bên trong popover bị preventDefault
 * nên danh sách dài không cuộn được bằng chuột/trackpad.
 * Hook này chỉ can thiệp khi wheel đã bị chặn: tự cuộn phần tử scrollable
 * gần nhất bên trong popover.
 */
function useWheelInsideScrollLock(node: HTMLElement | null) {
  React.useEffect(() => {
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.defaultPrevented) return;
      let el = event.target as HTMLElement | null;
      while (el && node.contains(el)) {
        const style = window.getComputedStyle(el);
        const scrollable =
          /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
        if (scrollable) {
          el.scrollTop += event.deltaY;
          return;
        }
        el = el.parentElement;
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [node]);
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  useWheelInsideScrollLock(node);
  const setRefs = React.useCallback(
    (value: HTMLElement | null) => {
      setNode(value);
      if (typeof ref === "function") ref(value as never);
      else if (ref) (ref as React.MutableRefObject<unknown>).current = value;
    },
    [ref],
  );
  return (
    <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={setRefs}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-card border border-border-default bg-popover p-4 text-popover-foreground shadow-level-3 outline-none cen-popover-motion data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-popover-content-transform-origin)",
        className,
      )}
      {...props}
    />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
