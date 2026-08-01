import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecognitionFeed } from "@/components/recognition/recognition-feed";
import { RecognitionFormModal } from "@/components/recognition/recognition-form";
import { useAuth } from "@/hooks/use-auth";
import { RECOGNITION_DAILY_LIMIT, recognitionQuotaQuery } from "@/lib/recognition-data";

/**
 * CEN TODAY-02 — Trang Ghi nhận đồng đội.
 * Không nhân bản Business Rule: hạn mức, quan hệ làm việc và cửa sổ thu hồi do database quyết định.
 */
export const Route = createFileRoute("/_authenticated/recognitions")({
  head: () => ({
    meta: [
      { title: "Ghi nhận đồng đội — CEN WORK" },
      {
        name: "description",
        content:
          "Gửi và theo dõi lời ghi nhận tích cực giữa các đồng đội trong CEN WORK, có giới hạn chống spam và thu hồi trong 10 phút.",
      },
      { property: "og:title", content: "Ghi nhận đồng đội — CEN WORK" },
      {
        property: "og:description",
        content:
          "Gửi và theo dõi lời ghi nhận tích cực giữa các đồng đội trong CEN WORK, có giới hạn chống spam và thu hồi trong 10 phút.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecognitionsPage,
});

function RecognitionsPage() {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const quotaResult = useQuery(recognitionQuotaQuery(user?.id));
  const quota = quotaResult.data ?? 0;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Ghi nhận đồng đội"
        description={`Ghi nhận đóng góp thực tế của đồng nghiệp. Còn ${quota}/${RECOGNITION_DAILY_LIMIT} lượt trong hôm nay.`}
        actions={
          <Button onClick={() => setOpen(true)} disabled={quota <= 0}>
            <Sparkles />
            Ghi nhận đồng đội
          </Button>
        }
      />

      <Tabs defaultValue="all" className="min-w-0">
        <TabsList>
          <TabsTrigger value="all">Toàn bộ</TabsTrigger>
          <TabsTrigger value="mine">Liên quan tới tôi</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <RecognitionFeed />
        </TabsContent>
        <TabsContent value="mine">
          <RecognitionFeed personId={user?.id ?? null} />
        </TabsContent>
      </Tabs>

      <RecognitionFormModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
