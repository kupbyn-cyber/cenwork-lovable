import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, TableCellStack } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectFormDrawer } from "@/components/project/project-form-drawer";
import { useOrgAccess } from "@/hooks/use-org-access";
import { facilitiesQuery, teamsQuery } from "@/lib/org-data";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_TONE,
  activePeopleQuery,
  formatDate,
  isProjectArchived,
  isOverdue,
  projectsQuery,
  timeProgress,
  type ProjectRow,
} from "@/lib/project-data";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Dự án — CEN WORK" },
      {
        name: "description",
        content:
          "Danh sách dự án CEN WORK: trạng thái, Project Owner, Team tham gia và tiến độ thời gian.",
      },
      { property: "og:title", content: "Dự án — CEN WORK" },
      {
        property: "og:description",
        content:
          "Danh sách dự án CEN WORK: trạng thái, Project Owner, Team tham gia và tiến độ thời gian.",
      },
    ],
  }),
  component: ProjectsPage,
});

const ALL = "__all__";

function ProjectsPage() {
  const access = useOrgAccess();
  const navigate = useNavigate();

  const projectsResult = useQuery(projectsQuery());
  const teamsResult = useQuery(teamsQuery());
  const facilitiesResult = useQuery(facilitiesQuery());
  const peopleResult = useQuery(activePeopleQuery());

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const [ownerFilter, setOwnerFilter] = React.useState(ALL);
  const [teamFilter, setTeamFilter] = React.useState(ALL);
  const [facilityFilter, setFacilityFilter] = React.useState(ALL);
  const [view, setView] = React.useState<"active" | "archived">("active");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false);

  const teams = teamsResult.data ?? [];
  const facilities = facilitiesResult.data ?? [];
  const people = peopleResult.data ?? [];
  const teamName = (id: string) => teams.find((team) => team.id === id)?.name ?? "—";

  const rows = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (projectsResult.data ?? []).filter((project) => {
      if (isProjectArchived(project) !== (view === "archived")) return false;
      if (keyword && !project.name.toLowerCase().includes(keyword)) return false;
      if (statusFilter !== ALL && project.status !== statusFilter) return false;
      if (ownerFilter !== ALL && project.owner_id !== ownerFilter) return false;
      if (teamFilter !== ALL && !project.teamIds.includes(teamFilter)) return false;
      if (facilityFilter !== ALL && !project.facilityIds.includes(facilityFilter)) return false;
      return true;
    });
  }, [projectsResult.data, search, statusFilter, ownerFilter, teamFilter, facilityFilter, view]);

  const columns = [
    {
      id: "name",
      header: "Dự án",
      className: "min-w-[220px]",
      cell: (row: ProjectRow) => (
        <TableCellStack primary={row.name} secondary={row.objective} />
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      className: "min-w-[150px]",
      cell: (row: ProjectRow) => (
        <StatusBadge label={PROJECT_STATUS_LABEL[row.status]} tone={PROJECT_STATUS_TONE[row.status]} />
      ),
    },
    {
      id: "owner",
      header: "Project Owner",
      className: "min-w-[150px]",
      cell: (row: ProjectRow) => (
        <span className="text-text-secondary">{row.ownerName ?? "Chưa chỉ định"}</span>
      ),
    },
    {
      id: "teams",
      header: "Team",
      className: "min-w-[160px]",
      cell: (row: ProjectRow) => (
        <span className="text-text-secondary">
          {row.teamIds.length === 0 ? "—" : row.teamIds.map(teamName).join(", ")}
        </span>
      ),
    },
    {
      id: "progress",
      header: "Tiến độ thời gian",
      className: "min-w-[160px]",
      cell: (row: ProjectRow) => {
        const value = timeProgress(row);
        if (value === null) return <span className="text-text-muted">Chưa có mốc thời gian</span>;
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <Progress value={value} />
            <span className="text-caption text-text-muted">{value}%</span>
          </div>
        );
      },
    },
    {
      id: "deadline",
      header: "Deadline",
      className: "min-w-[130px]",
      cell: (row: ProjectRow) => (
        <span className={isOverdue(row) ? "text-state-danger" : "text-text-secondary"}>
          {formatDate(row.deadline)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Dự án"
        description="Ý tưởng, quy trình duyệt và dự án chính thức trong phạm vi bạn được xem."
        actions={
          <div className="flex flex-wrap gap-2">
            {access.can("projects.create") ? (
              <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                <Plus />
                Gửi ý tưởng
              </Button>
            ) : null}
            {access.can("projects.create_official") ? (
              <Button onClick={() => setCreateProjectOpen(true)}>
                <Plus />
                Tạo dự án
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Input
          placeholder="Tìm theo tên dự án"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Tìm theo tên dự án"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Lọc theo trạng thái">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {PROJECT_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {PROJECT_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger aria-label="Lọc theo Project Owner">
            <SelectValue placeholder="Project Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Owner</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger aria-label="Lọc theo Team">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Team</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={facilityFilter} onValueChange={setFacilityFilter}>
          <SelectTrigger aria-label="Lọc theo Cơ sở">
            <SelectValue placeholder="Cơ sở" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả Cơ sở</SelectItem>
            {facilities.map((facility) => (
              <SelectItem key={facility.id} value={facility.id}>
                {facility.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        loading={projectsResult.isLoading}
        error={projectsResult.isError}
        onRetry={() => void projectsResult.refetch()}
        errorTitle="Không tải được danh sách dự án"
        emptyTitle="Chưa có dự án nào"
        emptyDescription="Gửi ý tưởng đầu tiên để bắt đầu quy trình duyệt."
        onRowClick={(row) =>
          void navigate({ to: "/projects/$projectId", params: { projectId: row.id } })
        }
      />

      {access.userId ? (
        <ProjectFormDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          project={null}
          fullEdit={false}
          currentUserId={access.userId}
          teams={teams}
          facilities={facilities}
          people={people}
          onCreated={(projectId) =>
            void navigate({ to: "/projects/$projectId", params: { projectId } })
          }
        />
      ) : null}

      {access.userId && access.can("projects.create_official") ? (
        <ProjectFormDrawer
          open={createProjectOpen}
          onOpenChange={setCreateProjectOpen}
          project={null}
          fullEdit={false}
          createMode="official"
          currentUserId={access.userId}
          teams={teams}
          facilities={facilities}
          people={people}
          onCreated={(projectId) =>
            void navigate({ to: "/projects/$projectId", params: { projectId } })
          }
        />
      ) : null}
    </div>
  );
}
