import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FacilitiesSection, TeamsSection } from "@/components/org/org-sections";

export const Route = createFileRoute("/_authenticated/organization")({
  head: () => ({
    meta: [
      { title: "Cơ cấu tổ chức — CEN 1.0" },
      {
        name: "description",
        content: "Quản lý Team và danh mục cơ sở của CEN 1.0 trong một màn hình duy nhất.",
      },
      { property: "og:title", content: "Cơ cấu tổ chức — CEN 1.0" },
      {
        property: "og:description",
        content: "Quản lý Team và danh mục cơ sở của CEN 1.0 trong một màn hình duy nhất.",
      },
    ],
  }),
  component: OrganizationPage,
});

function OrganizationPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Cơ cấu tổ chức"
        description="Team và cơ sở là hai danh mục nền cho các module vận hành tiếp theo."
      />
      <Tabs defaultValue="teams" className="min-w-0">
        <TabsList>
          <TabsTrigger value="teams">Team</TabsTrigger>
          <TabsTrigger value="facilities">Cơ sở</TabsTrigger>
        </TabsList>
        <TabsContent value="teams">
          <TeamsSection />
        </TabsContent>
        <TabsContent value="facilities">
          <FacilitiesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
