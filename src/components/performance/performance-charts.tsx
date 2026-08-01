import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PanelCard } from "@/components/performance/performance-primitives";
import { METRIC_TOOLTIP, type TrendPoint, type WorkloadMetrics } from "@/lib/performance";

/**
 * PERFORMANCE — biểu đồ xu hướng và phân bổ trạng thái.
 * Không vẽ khi dữ liệu nguồn trống: hiển thị Empty State thay vì trục rỗng.
 */
const AXIS = "var(--text-muted)";

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const hasData = trend.some((p) => p.done > 0 || p.created > 0 || p.due > 0);
  return (
    <PanelCard
      title="Xu hướng theo thời gian"
      hint="Số Task được tạo, tới hạn và hoàn thành theo từng ngày trong kỳ (giờ Hà Nội)."
      empty={hasData ? undefined : "Chưa đủ dữ liệu Task trong kỳ để vẽ biểu đồ."}
    >
      {hasData ? (
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => value.slice(5)}
                stroke={AXIS}
                fontSize={11}
              />
              <YAxis allowDecimals={false} stroke={AXIS} fontSize={11} />
              <RechartsTooltip
                contentStyle={{
                  background: "var(--surface-raised, var(--background))",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="done"
                name="Hoàn thành"
                stroke="var(--brand-primary)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="created"
                name="Task mới"
                stroke="var(--text-muted)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="due"
                name="Tới hạn"
                stroke="var(--state-warning)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </PanelCard>
  );
}

export function StatusDistributionChart({ workload }: { workload: WorkloadMetrics }) {
  const data = [
    { label: "Chưa bắt đầu", value: workload.not_started },
    { label: "Đang thực hiện", value: workload.in_progress },
    { label: "Chờ kiểm tra", value: workload.review },
    { label: "Hoàn thành", value: workload.done },
    { label: "Quá hạn", value: workload.overdue },
    { label: "Hoàn thành trễ", value: workload.late_done },
  ];
  const hasData = data.some((d) => d.value > 0);
  return (
    <PanelCard
      title="Phân bổ trạng thái Task"
      hint={`${METRIC_TOOLTIP.primary} Quá hạn và Hoàn thành trễ hiển thị riêng để không đếm trùng.`}
      empty={hasData ? undefined : "Chưa có Task hợp lệ trong kỳ."}
    >
      {hasData ? (
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="label" stroke={AXIS} fontSize={10} interval={0} angle={-12} dy={8} />
              <YAxis allowDecimals={false} stroke={AXIS} fontSize={11} />
              <RechartsTooltip
                cursor={{ fill: "var(--surface-subtle)" }}
                contentStyle={{
                  background: "var(--surface-raised, var(--background))",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" name="Task" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </PanelCard>
  );
}
