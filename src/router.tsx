import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  /**
   * PERF-02.1: giữ nguyên default của React Query cho toàn hệ thống.
   * Cấu hình cache/refetch của PERF-02 đặt tại từng query Trang chủ.
   */
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
