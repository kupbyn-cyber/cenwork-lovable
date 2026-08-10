import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/cen/client";
import type { Database } from "@/integrations/supabase/types";
import { DOCUMENT_SOURCE_LABEL, DOCUMENT_TYPE_LABEL } from "@/lib/document-catalog";

/**
 * SEARCH-01 — Tìm kiếm toàn hệ thống (5 nhóm).
 * Mọi truy vấn đi qua client trình duyệt nên RLS của từng bảng là chốt quyền thật:
 * bản ghi ngoài quyền không bao giờ rời khỏi database. UI chỉ hiển thị và điều hướng.
 */
export type SearchGroupKey = "projects" | "tasks" | "members" | "documents" | "messages";

export const SEARCH_GROUP_LABEL: Record<SearchGroupKey, string> = {
  projects: "Dự án",
  tasks: "Công việc",
  members: "Thành viên",
  documents: "Tài liệu",
  messages: "Thông báo & Phê duyệt",
};

export const SEARCH_MIN_LENGTH = 2;
const GROUP_LIMIT = 5;

export interface SearchHit {
  key: string;
  group: SearchGroupKey;
  id: string;
  title: string;
  /** Dòng phụ: trạng thái, người phụ trách, team… đủ để phân biệt. */
  meta: string[];
  /** Chỉ dùng cho nhóm Thành viên (avatar). */
  avatarPath?: string | null;
  kind?: "announcement" | "approval";
}

export interface SearchResults {
  term: string;
  groups: { group: SearchGroupKey; hits: SearchHit[] }[];
  total: number;
}

type ProjectStatus = Database["public"]["Enums"]["project_status"];
type TaskStatus = Database["public"]["Enums"]["task_status"];

const PROJECT_STATUS: Record<string, string> = {
  draft: "Nháp",
  pending: "Chờ duyệt",
  active: "Đang chạy",
  completed: "Hoàn thành",
  rejected: "Bị từ chối",
  cancelled: "Đã hủy",
  on_hold: "Tạm dừng",
};

const TASK_STATUS: Record<string, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang thực hiện",
  review: "Chờ kiểm tra",
  done: "Hoàn thành",
};

const ANNOUNCEMENT_STATUS: Record<string, string> = {
  draft: "Nháp",
  published: "Đã phát hành",
  revoked: "Đã thu hồi",
  archived: "Đã lưu trữ",
};

const APPROVAL_STATUS: Record<string, string> = {
  pending: "Chờ xử lý",
  overdue: "Quá hạn",
  approved: "Đã phê duyệt",
  rejected: "Đã từ chối",
  withdrawn: "Đã thu hồi",
};

/** Escape ký tự đặc biệt của PostgREST `or()` để từ khóa luôn là dữ liệu, không phải cú pháp. */
function safeTerm(term: string): string {
  return term.replace(/[,()\\%_"']/g, " ").trim();
}

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

/** Điểm ưu tiên: khớp đầu tiêu đề > chứa từ khóa. */
function score(title: string, term: string): number {
  const lower = title.toLowerCase();
  const q = term.toLowerCase();
  if (lower === q) return 0;
  if (lower.startsWith(q)) return 1;
  if (lower.includes(q)) return 2;
  return 3;
}

function sortHits(hits: SearchHit[], term: string): SearchHit[] {
  return [...hits]
    .sort((a, b) => score(a.title, term) - score(b.title, term) || a.title.localeCompare(b.title))
    .slice(0, GROUP_LIMIT);
}

/** Danh bạ nội bộ (đã bị RPC lọc theo quyền) — dùng cho nhóm Thành viên và để hiện tên người. */
export interface SearchDirectory {
  people: { id: string; name: string; email: string; teamId: string | null; jobTitle: string | null; status: string; avatarPath: string | null }[];
  teams: { id: string; name: string }[];
}

export async function fetchSearchDirectory(): Promise<SearchDirectory> {
  const [people, teams] = await Promise.all([
    supabase.rpc("member_directory"),
    supabase.from("teams").select("id,name"),
  ]);
  const rows = (people.data ?? []) as Record<string, unknown>[];
  return {
    people: rows.map((row) => ({
      id: String(row["id"]),
      name: String(row["display_name"] ?? ""),
      email: String(row["email"] ?? ""),
      teamId: (row["primary_team_id"] as string | null) ?? null,
      jobTitle: (row["job_title"] as string | null) ?? null,
      status: String(row["status"] ?? "active"),
      avatarPath: (row["avatar_path"] as string | null) ?? null,
    })),
    teams: ((teams.data ?? []) as { id: string; name: string }[]).map((team) => ({
      id: team.id,
      name: team.name,
    })),
  };
}

export const searchDirectoryQuery = () =>
  queryOptions({
    queryKey: ["search-directory"],
    queryFn: fetchSearchDirectory,
    staleTime: 5 * 60_000,
  });

async function searchProjects(term: string, nameOf: (id: string | null) => string | null) {
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,objective,description,status,owner_id")
    .or(`name.ilike.${pattern},objective.ilike.${pattern},description.ilike.${pattern}`)
    .limit(GROUP_LIMIT * 3);
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    id: string;
    name: string;
    status: ProjectStatus;
    owner_id: string | null;
  }[]).map<SearchHit>((row) => ({
    key: `projects:${row.id}`,
    group: "projects",
    id: row.id,
    title: row.name,
    meta: [PROJECT_STATUS[row.status] ?? row.status, nameOf(row.owner_id)].filter(
      (value): value is string => Boolean(value),
    ),
  }));
}

async function searchTasks(
  term: string,
  matchedPeople: string[],
  nameOf: (id: string | null) => string | null,
) {
  const pattern = `%${term}%`;
  const filters = [`name.ilike.${pattern}`, `description.ilike.${pattern}`];
  if (matchedPeople.length > 0) filters.push(`assignee_id.in.(${matchedPeople.join(",")})`);
  const { data, error } = await supabase
    .from("tasks")
    .select("id,name,status,deadline,assignee_id,project_id,projects(name)")
    .or(filters.join(","))
    .limit(GROUP_LIMIT * 3);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    status: TaskStatus;
    deadline: string | null;
    assignee_id: string | null;
    projects: { name: string } | null;
  }[];

  // Tên dự án liên quan: lọc thêm bằng truy vấn riêng để không kéo cả bảng về máy.
  const byProject = await supabase
    .from("tasks")
    .select("id,name,status,deadline,assignee_id,project_id,projects!inner(name)")
    .ilike("projects.name", pattern)
    .limit(GROUP_LIMIT * 2);
  if (byProject.error) throw new Error(byProject.error.message);
  const merged = [...rows];
  for (const row of (byProject.data ?? []) as unknown as typeof rows) {
    if (!merged.some((item) => item.id === row.id)) merged.push(row);
  }

  return merged.map<SearchHit>((row) => ({
    key: `tasks:${row.id}`,
    group: "tasks",
    id: row.id,
    title: row.name,
    meta: [
      TASK_STATUS[row.status] ?? row.status,
      nameOf(row.assignee_id),
      row.projects?.name ?? null,
      fmtDate(row.deadline) ? `Hạn ${fmtDate(row.deadline)}` : null,
    ].filter((value): value is string => Boolean(value)),
  }));
}

async function searchDocuments(term: string, nameOf: (id: string | null) => string | null) {
  const pattern = `%${term}%`;
  const lower = term.toLowerCase();
  // doc_type / source_type là enum: khớp theo nhãn tiếng Việt rồi lọc bằng giá trị enum.
  const types = Object.entries(DOCUMENT_TYPE_LABEL)
    .filter(([, label]) => String(label).toLowerCase().includes(lower))
    .map(([value]) => value);
  const sources = Object.entries(DOCUMENT_SOURCE_LABEL)
    .filter(([, label]) => String(label).toLowerCase().includes(lower))
    .map(([value]) => value);
  const filters = [
    `name.ilike.${pattern}`,
    `display_name.ilike.${pattern}`,
    `description.ilike.${pattern}`,
  ];
  if (types.length > 0) filters.push(`doc_type.in.(${types.join(",")})`);
  if (sources.length > 0) filters.push(`source_type.in.(${sources.join(",")})`);
  const { data, error } = await supabase
    .from("documents")
    .select("id,name,display_name,doc_type,description,source_type,owner_id,archived_at")
    .is("deleted_at", null)
    .or(filters.join(","))
    .limit(GROUP_LIMIT * 3);
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    id: string;
    name: string;
    display_name: string | null;
    doc_type: keyof typeof DOCUMENT_TYPE_LABEL;
    owner_id: string | null;
    archived_at: string | null;
  }[]).map<SearchHit>((row) => ({
    key: `documents:${row.id}`,
    group: "documents",
    id: row.id,
    title: row.display_name || row.name,
    meta: [
      DOCUMENT_TYPE_LABEL[row.doc_type] ?? row.doc_type,
      row.archived_at ? "Đã lưu trữ" : "Đang dùng",
      nameOf(row.owner_id),
    ].filter((value): value is string => Boolean(value)),
  }));
}

async function searchMessages(
  term: string,
  matchedPeople: string[],
  nameOf: (id: string | null) => string | null,
) {
  const pattern = `%${term}%`;
  const announcementFilters = [`title.ilike.${pattern}`];
  const approvalFilters = [`title.ilike.${pattern}`];
  if (matchedPeople.length > 0) {
    announcementFilters.push(`created_by.in.(${matchedPeople.join(",")})`);
    approvalFilters.push(`sender_id.in.(${matchedPeople.join(",")})`);
  }

  const [announcements, approvals] = await Promise.all([
    supabase
      .from("announcements")
      .select("id,title,status,created_by")
      .or(announcementFilters.join(","))
      .limit(GROUP_LIMIT * 2),
    supabase
      .from("approval_requests")
      .select("id,title,status,sender_id")
      .or(approvalFilters.join(","))
      .limit(GROUP_LIMIT * 2),
  ]);
  if (announcements.error) throw new Error(announcements.error.message);
  if (approvals.error) throw new Error(approvals.error.message);

  const hits: SearchHit[] = [];
  for (const row of (announcements.data ?? []) as {
    id: string;
    title: string;
    status: string;
    created_by: string | null;
  }[]) {
    hits.push({
      key: `announcement:${row.id}`,
      group: "messages",
      id: row.id,
      kind: "announcement",
      title: row.title || "(Chưa có tiêu đề)",
      meta: ["Thông báo", ANNOUNCEMENT_STATUS[row.status] ?? row.status, nameOf(row.created_by)].filter(
        (value): value is string => Boolean(value),
      ),
    });
  }
  for (const row of (approvals.data ?? []) as {
    id: string;
    title: string;
    status: string;
    sender_id: string | null;
  }[]) {
    hits.push({
      key: `approval:${row.id}`,
      group: "messages",
      id: row.id,
      kind: "approval",
      title: row.title || "(Chưa có tiêu đề)",
      meta: ["Phê duyệt", APPROVAL_STATUS[row.status] ?? row.status, nameOf(row.sender_id)].filter(
        (value): value is string => Boolean(value),
      ),
    });
  }
  return hits;
}

export async function runGlobalSearch(rawTerm: string): Promise<SearchResults> {
  const term = safeTerm(rawTerm);
  if (term.length < SEARCH_MIN_LENGTH) return { term, groups: [], total: 0 };

  const directory = await fetchSearchDirectory();
  const teamName = (id: string | null) =>
    directory.teams.find((team) => team.id === id)?.name ?? null;
  const nameOf = (id: string | null) =>
    id ? (directory.people.find((person) => person.id === id)?.name ?? null) : null;

  const lower = term.toLowerCase();
  const matchedTeamIds = directory.teams
    .filter((team) => team.name.toLowerCase().includes(lower))
    .map((team) => team.id);
  const memberHits = directory.people
    .filter(
      (person) =>
        person.status === "active" &&
        (person.name.toLowerCase().includes(lower) ||
          person.email.toLowerCase().includes(lower) ||
          (person.teamId ? matchedTeamIds.includes(person.teamId) : false)),
    )
    .map<SearchHit>((person) => ({
      key: `members:${person.id}`,
      group: "members",
      id: person.id,
      title: person.name,
      avatarPath: person.avatarPath,
      meta: [person.jobTitle, teamName(person.teamId)].filter(
        (value): value is string => Boolean(value),
      ),
    }));

  const matchedPeople = directory.people
    .filter(
      (person) =>
        person.name.toLowerCase().includes(lower) || person.email.toLowerCase().includes(lower),
    )
    .map((person) => person.id)
    .slice(0, 20);

  const [projects, tasks, documents, messages] = await Promise.all([
    searchProjects(term, nameOf),
    searchTasks(term, matchedPeople, nameOf),
    searchDocuments(term, nameOf),
    searchMessages(term, matchedPeople, nameOf),
  ]);

  const groups = (
    [
      ["projects", projects],
      ["tasks", tasks],
      ["members", memberHits],
      ["documents", documents],
      ["messages", messages],
    ] as [SearchGroupKey, SearchHit[]][]
  )
    .map(([group, hits]) => ({ group, hits: sortHits(hits, term) }))
    .filter((entry) => entry.hits.length > 0);

  return { term, groups, total: groups.reduce((sum, entry) => sum + entry.hits.length, 0) };
}

export const globalSearchQuery = (term: string) =>
  queryOptions({
    queryKey: ["global-search", term.trim().toLowerCase()],
    queryFn: () => runGlobalSearch(term),
    enabled: safeTerm(term).length >= SEARCH_MIN_LENGTH,
    staleTime: 30_000,
  });
