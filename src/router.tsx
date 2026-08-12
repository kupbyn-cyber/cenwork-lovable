import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  /**
   * PERF-02: dữ liệu nghiệp vụ CEN không cần realtime từng giây.
   * staleTime 60s + không refetch khi focus lại cửa sổ để bỏ các request trùng;
   * client tạo mới theo từng request nên không có cache dùng chung giữa người dùng.
   */
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
