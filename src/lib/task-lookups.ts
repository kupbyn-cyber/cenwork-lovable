import { supabase } from "@/integrations/cen/client";

/**
 * TASK-PERF-01 — tra cứu Dự án/Team dùng chung cho danh sách Công việc.
 *
 * Trước đây mỗi Task nhúng sẵn `projects(...)` và `teams(...)`; PostgreSQL phải
 * chạy một truy vấn con kèm RLS cho từng dòng nên danh sách lớn rất chậm.
 * Hai bảng này nhỏ và dùng chung cho mọi Task, nên nạp một lần rồi map ở bộ nhớ.
 * Phạm vi dữ liệu không đổi: hai truy vấn dưới đây vẫn chạy dưới RLS của người dùng.
 */
export interface ProjectLookupRow {
  id: string;
  name: string | null;
  owner_id: string | null;
  manually_archived_at: string | null;
  responsible_team_id: string | null;
}

let projects = new Map<string, ProjectLookupRow>();
let teams = new Map<string, string>();
let inflight: Promise<void> | null = null;
let loadedAt = 0;
const TTL_MS = 60_000;

async function load(): Promise<void> {
  const [projectResult, teamResult] = await Promise.all([
    supabase.from("projects").select("id,name,owner_id,manually_archived_at,responsible_team_id"),
    supabase.from("teams").select("id,name"),
  ]);

  if (!projectResult.error) {
    const next = new Map<string, ProjectLookupRow>();
    for (const row of (projectResult.data ?? []) as ProjectLookupRow[]) {
      if (row.id) next.set(row.id, row);
    }
    projects = next;
  }
  if (!teamResult.error) {
    const next = new Map<string, string>();
    for (const row of (teamResult.data ?? []) as { id: string; name: string | null }[]) {
      if (row.id && row.name) next.set(row.id, row.name);
    }
    teams = next;
  }
  loadedAt = Date.now();
}

/** Nạp (có cache ngắn) bảng tra cứu Dự án/Team trước khi map Task. */
export async function primeTaskLookups(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  if (!inflight) {
    inflight = load().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Xóa cache sau khi tạo/sửa Dự án hoặc Team. */
export function resetTaskLookups() {
  loadedAt = 0;
  projects = new Map();
  teams = new Map();
}

export function projectLookup(projectId: string | null | undefined): ProjectLookupRow | null {
  if (!projectId) return null;
  return projects.get(projectId) ?? null;
}

export function teamNameLookup(teamId: string | null | undefined): string | null {
  if (!teamId) return null;
  return teams.get(teamId) ?? null;
}
