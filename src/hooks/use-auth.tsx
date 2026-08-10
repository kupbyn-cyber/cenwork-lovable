import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/cen/client";

/**
 * CEN 1.0 — Auth context (M1.3)
 * Session do Auth provider quản lý (lưu trữ nội bộ của SDK).
 * Không tự lưu token/password vào storage, không log dữ liệu nhạy cảm.
 */
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** true khi chưa xác định được trạng thái session lần đầu. */
  initializing: boolean;
}

const AuthContext = React.createContext<AuthContextValue>({
  session: null,
  user: null,
  initializing: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [initializing, setInitializing] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setInitializing(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, initializing }),
    [session, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return React.useContext(AuthContext);
}

/** Tên hiển thị lấy từ metadata Auth, fallback về phần trước @ của email. */
export function getDisplayName(user: User | null | undefined): string {
  if (!user) return "";
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const raw = meta?.["display_name"] ?? meta?.["full_name"] ?? meta?.["name"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return user.email?.split("@")[0] ?? "";
}
