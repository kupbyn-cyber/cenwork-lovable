import * as React from "react";

/**
 * MOTION-02 — làm nổi bật nhẹ bản ghi vừa cập nhật rồi tự kết thúc.
 * Không chạy motion hai lần: mỗi id chỉ flash một lượt cho tới khi được kích hoạt lại.
 */
export function useFlashHighlight(durationMs = 900) {
  const [ids, setIds] = React.useState<Record<string, number>>({});
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  React.useEffect(() => {
    const store = timers.current;
    return () => {
      Object.values(store).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const flash = React.useCallback(
    (id: string) => {
      if (!id) return;
      const existing = timers.current[id];
      if (existing) clearTimeout(existing);
      setIds((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
      timers.current[id] = setTimeout(() => {
        delete timers.current[id];
        setIds((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, durationMs);
    },
    [durationMs],
  );

  const isFlashing = React.useCallback((id: string) => id in ids, [ids]);

  /** key ổn định để React remount phần tử, tránh animation chạy chồng lần. */
  const flashKey = React.useCallback((id: string) => ids[id] ?? 0, [ids]);

  return { flash, isFlashing, flashKey };
}
