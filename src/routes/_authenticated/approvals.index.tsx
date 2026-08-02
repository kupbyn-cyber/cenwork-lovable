import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Plus } from "lucide-react";

import { AnnouncementModuleTabs } from "@/components/announcement/module-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const TITLE = "Yêu cầu phê duyệt — CEN WORK";
const DESCRIPTION = "Theo dõi thông báo nội bộ và các yêu cầu cần phê duyệt trong CEN WORK.";

export const Route = createFileRoute("/_authenticated/approvals/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Thông báo & Phê duyệt"
        description="Theo dõi thông báo nội bộ và các yêu cầu cần phê duyệt."
        actions={
          <Button type="button" disabled title="Sẽ mở trong gói NAP-03">
            <Plus />
            Tạo phê duyệt
          </Button>
        }
      >
        <AnnouncementModuleTabs />
      </PageHeader>

      <Card>
        <CardContent>
          <EmptyState
            icon={ClipboardCheck}
            title="Chưa có yêu cầu phê duyệt"
            description="Luồng phê duyệt sẽ được mở trong gói tiếp theo."
          />
        </CardContent>
      </Card>
    </div>
  );
}
