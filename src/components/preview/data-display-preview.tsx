import * as React from "react";
import { CircleDot, Info, Pencil, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarGroup, AvatarImage, EntityAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BreadcrumbNav } from "@/components/ui/breadcrumb";
import { Button, IconButton } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, TableCellStack, TableRowActions, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Divider } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-default bg-surface p-4">
      <p className="mb-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

export function BadgeAvatarPreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Block title="Badge variant">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutral</Badge>
          <Badge variant="brand">Brand</Badge>
          <Badge variant="brand-subtle">Brand subtle</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="error">Error</Badge>
          <Badge variant="info">Information</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge size="sm">Size sm</Badge>
          <Badge size="md" icon={<Info />}>
            Có icon
          </Badge>
          <Badge variant="info" className="max-w-[160px]">
            Nhãn rất dài để kiểm tra truncate trong badge
          </Badge>
        </div>
      </Block>

      <Block title="Status badge (label + tone qua props)">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Trạng thái mẫu A" tone="neutral" />
          <StatusBadge label="Trạng thái mẫu B" tone="progress" />
          <StatusBadge label="Trạng thái mẫu C" tone="success" />
          <StatusBadge label="Trạng thái mẫu D" tone="warning" />
          <StatusBadge label="Trạng thái mẫu E" tone="error" />
          <StatusBadge label="Có icon" tone="progress" icon={<CircleDot />} />
        </div>
        <p className="mt-3 text-helper text-text-muted">
          Không chứa danh sách trạng thái nghiệp vụ.
        </p>
      </Block>

      <Block title="Avatar">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Avatar size="xs">
              <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="" />
              <AvatarFallback aria-hidden="true">MK</AvatarFallback>
              <span className="sr-only">Ảnh minh họa trung tính</span>
            </Avatar>
            <Avatar size="sm">
              <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="" />
              <AvatarFallback aria-hidden="true">MK</AvatarFallback>
              <span className="sr-only">Ảnh minh họa trung tính</span>
            </Avatar>
            <Avatar size="md">
              <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="" />
              <AvatarFallback aria-hidden="true">MK</AvatarFallback>
              <span className="sr-only">Ảnh minh họa trung tính</span>
            </Avatar>
            <Avatar size="lg">
              <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="" />
              <AvatarFallback aria-hidden="true">MK</AvatarFallback>
              <span className="sr-only">Ảnh minh họa trung tính</span>
            </Avatar>
          </div>
          <EntityAvatar name="Mục kiểm tra 01" />
          <EntityAvatar name="Mục kiểm tra 02" src="https://invalid.example/none.png" />
          <EntityAvatar name="?" fallback="—" />
        </div>
        <p className="mt-3 text-helper text-text-muted">
          Ảnh · Initials · Fallback khi ảnh lỗi (ảnh giữa dùng URL sai).
        </p>
      </Block>

      <Block title="Avatar group (chỉ hình thức)">
        <AvatarGroup overflow={3}>
          <EntityAvatar size="sm" name="Mục kiểm tra 01" />
          <EntityAvatar size="sm" name="Nhóm nội dung" />
          <EntityAvatar size="sm" name="Bản ghi mẫu" />
        </AvatarGroup>
      </Block>
    </div>
  );
}

export function CardPreview() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Card cơ bản</CardTitle>
            <CardDescription>Mô tả ngắn cho card.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>Nội dung ngắn.</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Card có header và action</CardTitle>
            <CardDescription>Action truyền từ bên ngoài.</CardDescription>
          </div>
          <CardAction>
            <Button size="sm" variant="secondary">
              Hành động
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <SectionHeader
            compact
            title="Section header dạng gọn"
            description="Dùng bên trong card."
            actions={
              <Button size="sm" variant="ghost">
                Xem
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card interactive>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Card có tương tác</CardTitle>
            <CardDescription>Hover đổi nền và viền.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>Trạng thái hover dùng cho card có thể chọn.</CardContent>
      </Card>

      <Card density="compact">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Density compact</CardTitle>
          </div>
        </CardHeader>
        <CardContent>Padding gọn hơn qua props, không tạo card mới.</CardContent>
        <CardFooter>
          <Button size="sm">Xác nhận</Button>
          <Button size="sm" variant="ghost">
            Hủy
          </Button>
        </CardFooter>
      </Card>

      <Card className="md:col-span-2 xl:col-span-2">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Card nội dung dài</CardTitle>
            <CardDescription>Kiểm tra xuống dòng và footer.</CardDescription>
          </div>
          <CardAction>
            <IconButton label="Chỉnh sửa mục" variant="ghost" size="icon-sm">
              <Pencil />
            </IconButton>
          </CardAction>
        </CardHeader>
        <CardContent>
          Đoạn nội dung dài dùng để kiểm tra khả năng xuống dòng của card trong bố cục lưới. Nội
          dung trung tính, không gắn với nghiệp vụ, chỉ nhằm quan sát mật độ chữ, khoảng cách dòng
          và độ tương phản trên nền tối của giao diện quản trị.
        </CardContent>
        <CardFooter className="justify-end">
          <Button size="sm" variant="secondary">
            Phụ
          </Button>
          <Button size="sm">Chính</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

interface DemoRow {
  id: string;
  name: string;
  group: string;
  status: { label: string; tone: "neutral" | "progress" | "success" | "warning" | "error" };
  owner: string;
  date: string;
}

const demoRows: DemoRow[] = [
  {
    id: "row-01",
    name: "Mục kiểm tra 01",
    group: "Nhóm nội dung",
    status: { label: "Trạng thái mẫu", tone: "progress" },
    owner: "Bản ghi A",
    date: "20/08/2026",
  },
  {
    id: "row-02",
    name: "Mục kiểm tra 02 với tiêu đề rất dài để kiểm tra truncate trong ô bảng",
    group: "Nhóm nội dung phụ",
    status: { label: "Trạng thái mẫu", tone: "success" },
    owner: "Bản ghi B",
    date: "20/08/2026",
  },
  {
    id: "row-03",
    name: "Mục kiểm tra 03",
    group: "Nhóm nội dung",
    status: { label: "Trạng thái mẫu", tone: "warning" },
    owner: "Bản ghi C",
    date: "20/08/2026",
  },
  {
    id: "row-04",
    name: "Mục kiểm tra 04",
    group: "Nhóm nội dung",
    status: { label: "Trạng thái mẫu", tone: "error" },
    owner: "Bản ghi D",
    date: "20/08/2026",
  },
];

export function TablePreview() {
  const [selectedIds, setSelectedIds] = React.useState<string[]>(["row-02"]);

  const columns: DataTableColumn<DemoRow>[] = [
    {
      id: "name",
      header: "Nội dung",
      className: "min-w-[220px] max-w-[320px]",
      cell: (row) => <TableCellStack primary={row.name} secondary={row.group} />,
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[150px]",
      cell: (row) => <StatusBadge label={row.status.label} tone={row.status.tone} />,
    },
    {
      id: "owner",
      header: "Liên quan",
      className: "min-w-[180px]",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <EntityAvatar size="xs" name={row.owner} />
          <span className="truncate text-body text-text-primary">{row.owner}</span>
        </div>
      ),
    },
    {
      id: "date",
      header: "Ngày",
      className: "min-w-[110px] whitespace-nowrap",
      cell: (row) => <span className="tabular-nums">{row.date}</span>,
    },
    {
      id: "actions",
      header: <span className="sr-only">Hành động</span>,
      align: "right",
      className: "w-[96px]",
      cell: (row) => (
        <TableRowActions>
          <IconButton label={`Chỉnh sửa ${row.name}`} variant="ghost" size="icon-sm">
            <Pencil />
          </IconButton>
          <IconButton label={`Xóa ${row.name}`} variant="ghost" size="icon-sm">
            <Trash2 />
          </IconButton>
        </TableRowActions>
      ),
    },
  ];

  return (
    <div className="min-w-0 space-y-3">
      <DataTable
        caption="Bảng trình diễn trung tính"
        columns={columns}
        data={demoRows}
        getRowId={(row) => row.id}
        selectable
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
      />
      <p className="text-helper text-text-muted">
        Selected state do bên ngoài truyền vào ({selectedIds.length} dòng). Không có sort, filter
        hay pagination thật.
      </p>
    </div>
  );
}

export function StructurePreview() {
  const [tab, setTab] = React.useState("tab-1");

  return (
    <div className="min-w-0 space-y-6">
      <Block title="Page header">
        <PageHeader
          breadcrumb={
            <BreadcrumbNav
              items={[
                { label: "Cấp một", href: "#" },
                { label: "Cấp hai", href: "#" },
                { label: "Cấp ba rất dài để kiểm tra truncate", href: "#" },
                { label: "Mục hiện tại" },
              ]}
            />
          }
          title="Tiêu đề trang mẫu"
          description="Mô tả ngắn của trang, chỉ mang tính cấu trúc."
          meta={
            <>
              <Badge variant="neutral">Metadata</Badge>
              <StatusBadge label="Trạng thái mẫu" tone="neutral" />
            </>
          }
          actions={
            <>
              <Button size="sm" variant="secondary">
                Hành động phụ
              </Button>
              <Button size="sm">Hành động chính</Button>
            </>
          }
        />
      </Block>

      <Block title="Section header">
        <SectionHeader
          title="Tiêu đề section"
          description="Mô tả tùy chọn của section."
          actions={
            <Button size="sm" variant="ghost">
              Hành động
            </Button>
          }
        />
      </Block>

      <Block title="Tabs">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="tab-1">Tab một</TabsTrigger>
            <TabsTrigger value="tab-2">Tab hai</TabsTrigger>
            <TabsTrigger value="tab-3" disabled>
              Tab bị khóa
            </TabsTrigger>
            <TabsTrigger value="tab-4">Tab bốn</TabsTrigger>
            <TabsTrigger value="tab-5">Tab năm nội dung dài</TabsTrigger>
            <TabsTrigger value="tab-6">Tab sáu</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            <p className="text-body text-text-secondary">
              Nội dung tab được điều khiển từ bên ngoài (giá trị hiện tại: {tab}).
            </p>
          </TabsContent>
        </Tabs>
      </Block>

      <Block title="Divider">
        <div className="space-y-4">
          <Divider />
          <Divider label="Nhãn phân cách" />
          <div className="flex h-8 items-center gap-3">
            <span className="text-helper text-text-muted">Trái</span>
            <Divider orientation="vertical" />
            <span className="text-helper text-text-muted">Phải</span>
          </div>
        </div>
      </Block>
    </div>
  );
}
