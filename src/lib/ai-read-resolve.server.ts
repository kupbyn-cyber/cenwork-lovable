/**
 * CEN-AI-READ-01.3 — Entity Resolver dùng chung cho AI Read.
 *
 * Cho phép filter nhận TÊN người dùng hiểu được (Team / Member / Project)
 * thay vì UUID. Toàn bộ dữ liệu tra cứu đọc bằng đúng client của viewer
 * (`createUserDataClient`) nên RLS/permission hiện tại vẫn là ranh giới:
 * entity nào viewer không được thấy thì resolver cũng không thấy.
 *
 * Không mở rộng quyền, không dùng đặc quyền, không fuzzy tự chọn.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type EntityType = "team" | "member" | "project";

export interface ResolvedRef {
  id: string;
  name: string | null;
  team_name?: string | null;
}

export interface ResolvedFilterMeta {
  input: unknown;
  resolved: ResolvedRef[];
}

export class EntityResolveError extends Error {
  code: "ENTITY_NOT_FOUND" | "ENTITY_AMBIGUOUS";
  entityType: EntityType;
  query: string;
  candidates?: ResolvedRef[];

  constructor(
    code: "ENTITY_NOT_FOUND" | "ENTITY_AMBIGUOUS",
    message: string,
    entityType: EntityType,
    query: string,
    candidates?: ResolvedRef[],
  ) {
    super(message);
    this.code = code;
    this.entityType = entityType;
    this.query = query;
    if (candidates) this.candidates = candidates;
  }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Chuẩn hóa tên: trim, gộp khoảng trắng, bỏ dấu tiếng Việt, hạ chữ thường. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const LABEL: Record<EntityType, string> = {
  team: "team",
  member: "thành viên",
  project: "dự án",
};

interface Directory {
  byId: Map<string, ResolvedRef>;
  byName: Map<string, ResolvedRef[]>;
}

function buildDirectory(rows: ResolvedRef[]): Directory {
  const byId = new Map<string, ResolvedRef>();
  const byName = new Map<string, ResolvedRef[]>();
  for (const row of rows) {
    if (!row.id) continue;
    byId.set(row.id, row);
    const key = normalizeName(String(row.name ?? ""));
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }
  return { byId, byName };
}

/**
 * Resolver theo từng request: nạp danh mục một lần rồi tái sử dụng
 * (tránh N+1 khi có nhiều filter/nhiều giá trị).
 */
export function createEntityResolver(client: any) {
  const cache = new Map<EntityType, Promise<Directory>>();

  async function loadTeams(): Promise<Directory> {
    const { data } = await client.from("teams").select("id,name");
    return buildDirectory(
      ((data ?? []) as any[]).map((row) => ({ id: row.id, name: row.name ?? null })),
    );
  }

  async function loadMembers(): Promise<Directory> {
    const [{ data: people }, teams] = await Promise.all([
      client.rpc("member_directory"),
      directory("team"),
    ]);
    return buildDirectory(
      ((people ?? []) as any[]).map((row) => ({
        id: row.id,
        name: row.display_name ?? null,
        team_name: row.primary_team_id
          ? (teams.byId.get(row.primary_team_id)?.name ?? null)
          : null,
      })),
    );
  }

  async function loadProjects(): Promise<Directory> {
    const { data } = await client.from("projects").select("id,name").is("deleted_at", null);
    return buildDirectory(
      ((data ?? []) as any[]).map((row) => ({ id: row.id, name: row.name ?? null })),
    );
  }

  function directory(type: EntityType): Promise<Directory> {
    let entry = cache.get(type);
    if (!entry) {
      entry =
        type === "team" ? loadTeams() : type === "member" ? loadMembers() : loadProjects();
      cache.set(type, entry);
    }
    return entry;
  }

  async function resolveOne(type: EntityType, raw: unknown): Promise<ResolvedRef> {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new EntityResolveError(
        "ENTITY_NOT_FOUND",
        `Giá trị ${LABEL[type]} phải là UUID hoặc tên khác rỗng.`,
        type,
        String(raw ?? ""),
      );
    }
    const value = raw.trim();
    const dir = await directory(type);

    if (isUuid(value)) {
      // Backward compatible: UUID giữ nguyên, kể cả khi không nằm trong danh mục.
      return dir.byId.get(value) ?? { id: value, name: null };
    }

    const matches = dir.byName.get(normalizeName(value)) ?? [];
    if (matches.length === 0) {
      throw new EntityResolveError(
        "ENTITY_NOT_FOUND",
        `Không tìm thấy ${LABEL[type]} "${value}" trong phạm vi dữ liệu được phép xem.`,
        type,
        value,
      );
    }
    if (matches.length > 1) {
      throw new EntityResolveError(
        "ENTITY_AMBIGUOUS",
        `Có nhiều ${LABEL[type]} phù hợp với tên "${value}".`,
        type,
        value,
        matches,
      );
    }
    return matches[0]!;
  }

  return {
    /** Resolve một filter entity (string hoặc array) thành danh sách UUID. */
    async resolveFilter(
      type: EntityType,
      raw: unknown,
    ): Promise<{ ids: string[]; meta: ResolvedFilterMeta; hasName: boolean }> {
      const list = Array.isArray(raw) ? raw : [raw];
      if (list.length === 0) {
        throw new EntityResolveError(
          "ENTITY_NOT_FOUND",
          `Danh sách ${LABEL[type]} rỗng.`,
          type,
          "",
        );
      }
      const resolved: ResolvedRef[] = [];
      let hasName = false;
      for (const item of list) {
        if (typeof item === "string" && !isUuid(item.trim())) hasName = true;
        resolved.push(await resolveOne(type, item));
      }
      return {
        ids: resolved.map((entry) => entry.id),
        meta: { input: raw, resolved },
        hasName,
      };
    },
    directory,
  };
}

export type EntityResolver = ReturnType<typeof createEntityResolver>;
