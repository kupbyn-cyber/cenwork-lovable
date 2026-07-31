import * as React from "react";
import { Copy, FileText, Pencil, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardState,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn, TableCellStack } from "@/components/ui/data-table";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, FormErrorSummary } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton, SkeletonAvatar, SkeletonCard, SkeletonText } from "@/components/ui/skeleton";
import { LoadingBlock, Spinner } from "@/components/ui/spinner";
import { cenToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Khung con dùng lại trong style board. */
function Block({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-border-default bg-surface p-4 ${className ?? ""}`}>
      <p className="mb-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

const longParagraphs = Array.from({ length: 8 }).map(
  (_, index) =>
    `Đoạn nội dung trung tính số ${index + 1} dùng để kiểm tra khả năng cuộn bên trong overlay. Nội dung không gắn với nghiệp vụ, chỉ nhằm quan sát mật độ chữ, khoảng cách dòng và hành vi cuộn trên màn hình nhỏ.`,
);

export function OverlayPreview() {
  const [shortModal, setShortModal] = React.useState(false);
  const [longModal, setLongModal] = React.useState(false);
  const [confirmNormal, setConfirmNormal] = React.useState(false);
  const [confirmDestructive, setConfirmDestructive] = React.useState(false);
  const [confirmLoading, setConfirmLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [drawerRight, setDrawerRight] = React.useState(false);
  const [drawerBottom, setDrawerBottom] = React.useState(false);

  return (
    <div className="space-y-4">
      <Block label="Modal">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShortModal(true)}>
            Modal ngắn
          </Button>
          <Button variant="secondary" onClick={() => setLongModal(true)}>
            Modal nội dung dài
          </Button>
        </div>
        <p className="mt-3 text-helper text-text-muted">
          Nội dung dài cuộn bên trong, không vượt viewport, không cuộn ngang toàn trang.
        </p>

        <Modal
          open={shortModal}
          onOpenChange={setShortModal}
          title="Tiêu đề modal mẫu"
          description="Mô tả ngắn giải thích mục đích của modal."
          footer={
            <>
              <Button variant="secondary" onClick={() => setShortModal(false)}>
                Đóng
              </Button>
              <Button onClick={() => setShortModal(false)}>Hành động chính</Button>
            </>
          }
        >
          <p>Nội dung trung tính, không gắn với nghiệp vụ.</p>
        </Modal>

        <Modal
          open={longModal}
          onOpenChange={setLongModal}
          size="lg"
          title="Modal nội dung dài"
          description="Kiểm tra vùng cuộn nội bộ và footer cố định."
          footer={
            <>
              <Button variant="secondary" onClick={() => setLongModal(false)}>
                Hủy
              </Button>
              <Button onClick={() => setLongModal(false)}>Xác nhận</Button>
            </>
          }
        >
          <div className="space-y-3">
            {longParagraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </Modal>
      </Block>

      <Block label="Confirmation dialog">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirmNormal(true)}>
            Xác nhận thường
          </Button>
          <Button variant="destructive" onClick={() => setConfirmDestructive(true)}>
            Xác nhận destructive
          </Button>
          <Button variant="outline" onClick={() => setConfirmLoading(true)}>
            Xác nhận có loading
          </Button>
        </div>
        <p className="mt-3 text-helper text-text-muted">
          Dialog chỉ phát callback. Loading chặn thao tác lặp lại, button không đổi kích thước.
        </p>

        <ConfirmDialog
          open={confirmNormal}
          onOpenChange={setConfirmNormal}
          title="Xác nhận thao tác?"
          description="Mô tả ngắn về hệ quả của thao tác."
          onConfirm={() => {
            setConfirmNormal(false);
            cenToast.success("Đã ghi nhận xác nhận");
          }}
        />

        <ConfirmDialog
          open={confirmDestructive}
          onOpenChange={setConfirmDestructive}
          tone="destructive"
          title="Xóa mục đã chọn?"
          description="Thao tác không thể hoàn tác. Đây chỉ là mẫu giao diện."
          confirmLabel="Xóa"
          onConfirm={() => {
            setConfirmDestructive(false);
            cenToast.warning("Callback destructive đã được gọi");
          }}
        />

        <ConfirmDialog
          open={confirmLoading}
          onOpenChange={setConfirmLoading}
          title="Đang xử lý xác nhận"
          description="Nút xác nhận bị chặn khi loading."
          loading={loading}
          onConfirm={() => {
            setLoading(true);
            window.setTimeout(() => {
              setLoading(false);
              setConfirmLoading(false);
              cenToast.info("Kết thúc trạng thái loading mẫu");
            }, 1600);
          }}
        />
      </Block>

      <Block label="Drawer">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDrawerRight(true)}>
            Drawer bên phải
          </Button>
          <Button variant="secondary" onClick={() => setDrawerBottom(true)}>
            Drawer dưới
          </Button>
        </div>
        <p className="mt-3 text-helper text-text-muted">
          Panel tạm thời có overlay, cuộn nội bộ. Không phải Sidebar điều hướng.
        </p>

        <DrawerPanel
          open={drawerRight}
          onOpenChange={setDrawerRight}
          title="Tiêu đề drawer"
          description="Mô tả ngắn của ngăn nội dung."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDrawerRight(false)}>
                Đóng
              </Button>
              <Button onClick={() => setDrawerRight(false)}>Lưu</Button>
            </>
          }
        >
          <div className="space-y-3">
            {longParagraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </DrawerPanel>

        <DrawerPanel
          open={drawerBottom}
          onOpenChange={setDrawerBottom}
          side="bottom"
          title="Drawer dưới"
          description="Phù hợp cho thao tác nhanh trên mobile."
        >
          <div className="space-y-3">
            {longParagraphs.slice(0, 4).map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </DrawerPanel>
      </Block>

      <div className="grid gap-4 md:grid-cols-2">
        <Block label="Dropdown menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Mở menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Nhóm hành động</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => cenToast.info("Chọn mục 1")}>
                <FileText />
                Mục hành động 1
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => cenToast.info("Chọn mục 2")}>
                <Copy />
                Mục hành động 2
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Pencil />
                Mục bị vô hiệu hóa
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => cenToast.warning("Chọn mục destructive")}
              >
                <Trash2 />
                Hành động destructive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="mt-3 text-helper text-text-muted">
            Trigger truyền từ ngoài · item icon, separator, disabled, destructive · điều hướng bàn phím.
          </p>
        </Block>

        <Block label="Tooltip">
          <div className="flex flex-wrap items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover hoặc focus</Button>
              </TooltipTrigger>
              <TooltipContent>Giải thích ngắn, không thay Form Label.</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton variant="ghost" label="Sao chép">
                  <Copy />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent side="right">Sao chép nội dung</TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-3 text-helper text-text-muted">
            Chỉ nội dung ngắn, không chứa hành động chính.
          </p>
        </Block>
      </div>

      <Block label="Toast">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => cenToast.success("Thao tác thành công", { description: "Mô tả ngắn." })}
          >
            Success
          </Button>
          <Button variant="secondary" onClick={() => cenToast.error("Thao tác không thành công")}>
            Error
          </Button>
          <Button variant="secondary" onClick={() => cenToast.warning("Cần kiểm tra lại thông tin")}>
            Warning
          </Button>
          <Button variant="secondary" onClick={() => cenToast.info("Thông tin cập nhật")}>
            Information
          </Button>
          <Button variant="ghost" onClick={() => cenToast.dismiss()}>
            Đóng tất cả
          </Button>
        </div>
        <p className="mt-3 text-helper text-text-muted">
          Tự đóng theo thời gian, có nút đóng thủ công. Không dùng thay lỗi cấp field/form.
        </p>
      </Block>
    </div>
  );
}

export function StatePreview() {
  const [tableState, setTableState] = React.useState<"data" | "loading" | "empty" | "error">("data");
  const [cardState, setCardState] = React.useState<"data" | "loading" | "empty" | "error">("data");

  type Row = { id: string; name: string; group: string; code: string; date: string };
  const rows: Row[] = [
    { id: "r1", name: "Mục kiểm tra 01", group: "Nhóm nội dung", code: "MÃ-001", date: "20/08/2026" },
    { id: "r2", name: "Mục kiểm tra 02", group: "Nhóm nội dung", code: "MÃ-002", date: "20/08/2026" },
    { id: "r3", name: "Mục kiểm tra 03", group: "Nhóm nội dung", code: "MÃ-003", date: "20/08/2026" },
  ];

  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Nội dung",
      className: "min-w-[220px]",
      cell: (row) => <TableCellStack primary={row.name} secondary={row.group} />,
    },
    { id: "code", header: "Mã", cell: (row) => row.code },
    { id: "date", header: "Ngày", cell: (row) => row.date },
  ];

  const stateButtons = (
    value: typeof tableState,
    onChange: (next: typeof tableState) => void,
  ) => (
    <div className="mb-3 flex flex-wrap gap-2">
      {(["data", "loading", "empty", "error"] as const).map((item) => (
        <Button
          key={item}
          size="sm"
          variant={value === item ? "primary" : "outline"}
          onClick={() => onChange(item)}
        >
          {item}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Block label="Spinner">
          <div className="flex flex-wrap items-center gap-5">
            <Spinner size="xs" />
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
            <Button loading>Trong button</Button>
          </div>
          <div className="mt-3 rounded-card border border-border-default bg-background-elevated">
            <LoadingBlock compact />
          </div>
        </Block>

        <Block label="Skeleton">
          <div className="space-y-4">
            <SkeletonText lines={3} />
            <div className="flex items-center gap-3">
              <SkeletonAvatar size="sm" />
              <SkeletonAvatar shape="square" />
              <Skeleton className="h-9 w-28 rounded-control" />
            </div>
            <div className="rounded-card border border-border-default bg-background-elevated p-4">
              <SkeletonCard lines={2} withAvatar />
            </div>
          </div>
        </Block>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Block label="Empty state">
          <div className="space-y-3">
            <div className="rounded-card border border-border-default bg-background-elevated">
              <EmptyState
                title="Chưa có nội dung"
                description="Nội dung sẽ hiển thị tại đây khi có dữ liệu."
                action={<Button size="sm">Hành động chính</Button>}
              />
            </div>
            <div className="rounded-card border border-border-default bg-background-elevated">
              <EmptyState variant="compact" title="Chưa có nội dung" description="Dạng compact, không action." />
            </div>
          </div>
        </Block>

        <Block label="Error state">
          <div className="space-y-3">
            <div className="rounded-card border border-border-default bg-background-elevated">
              <ErrorState onRetry={() => cenToast.info("Callback thử lại đã được gọi")} />
            </div>
            <div className="rounded-card border border-border-default bg-background-elevated">
              <ErrorState variant="compact" description="Dạng compact, không có nút thử lại." />
            </div>
            <FormErrorSummary messages={["Thông báo lỗi cấp form mẫu.", "Không hiển thị lỗi kỹ thuật thô."]} />
          </div>
        </Block>
      </div>

      <Block label="Table · loading / empty / error">
        {stateButtons(tableState, setTableState)}
        <DataTable
          columns={columns}
          data={tableState === "data" ? rows : []}
          getRowId={(row) => row.id}
          loading={tableState === "loading"}
          error={tableState === "error"}
          onRetry={() => setTableState("data")}
          emptyAction={
            <Button size="sm" variant="secondary" onClick={() => setTableState("data")}>
              Tải lại mẫu
            </Button>
          }
          caption="Bảng mẫu kiểm tra trạng thái dùng chung"
        />
      </Block>

      <Block label="Card · loading / empty / error">
        {stateButtons(cardState, setCardState)}
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Card có trạng thái</CardTitle>
              <CardDescription>Dùng chung Skeleton, Empty State và Error State.</CardDescription>
            </div>
          </CardHeader>
          {cardState === "data" ? (
            <CardContent>
              <p>Nội dung trung tính khi có dữ liệu.</p>
            </CardContent>
          ) : (
            <CardState
              state={cardState}
              onRetry={() => setCardState("data")}
              action={
                cardState === "empty" ? (
                  <Button size="sm" variant="secondary" onClick={() => setCardState("data")}>
                    Tải lại mẫu
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
      </Block>
    </div>
  );
}
