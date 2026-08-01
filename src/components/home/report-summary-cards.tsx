import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { reportObligationsQuery } from "@/lib/report-obligation-data";
import { filterObligations, summarizeObligations } from "@/lib/report-stats-data";

/**
 * CEN 1.0 — REPORT-03: khối tóm tắt báo cáo trên Trang chủ.
 * Dùng đúng dữ liệu nghĩa vụ báo cáo trong phạm vi RLS của người dùng, 30 ngày gần nhất.
 */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function ReportSummaryCards() {
  const obligations = useQuery(reportObligationsQuery());

  const summary = React.useMemo(() => {
    const rows = filterObligations(obligations.data ?? [], {
      from: isoDaysAgo(30),
      to: isoDaysAgo(-1),
      reportType: null,
      teamId: null,
      userId: null,
    });
    return summarizeObligations(rows);
  }, [obligations.data]);

  if (obligations.isLoading) return <SkeletonCard lines={3} />;
  if (obligations.isError || summary.total === 0) return null;

  const items = [
    { label: "Đúng hạn", value: summary.submitted, icon: CheckCircle2 },
    { label: "Gửi trễ", value: summary.lateSubmitted, icon: Clock },
    { label: "Quá hạn", value: summary.overdue, icon: AlertTriangle },
    { label: "Chưa gửi", value: summary.pending, icon: FileText },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Báo cáo 30 ngày gần nhất</CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link to="/reports">Xem thống kê</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pt-0 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-control border border-border-default p-3">
            <div className="flex items-center gap-2 text-text-secondary">
              <item.icon className="size-icon-sm" aria-hidden="true" />
              <span className="text-sm">{item.label}</span>
            </div>
            <p className="text-xl font-semibold">{item.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
