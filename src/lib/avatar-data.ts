import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * CEN WORK — Ảnh đại diện cá nhân.
 * Ảnh lưu trong bucket riêng tư `avatars` theo đường dẫn ổn định {user_id}/avatar.
 * Quyền thật do Storage Policy quyết định: chỉ chủ tài khoản được ghi thư mục của mình.
 */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp";

/** Kiểm tra file phía client; server vẫn chặn bằng policy. */
export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
    return "Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Dung lượng ảnh tối đa 5 MB.";
  }
  return null;
}

export function avatarPathFor(userId: string): string {
  return `${userId}/avatar`;
}

/** Đọc đường dẫn ảnh đại diện đang lưu trong hồ sơ. */
export async function fetchAvatarPath(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.avatar_path ?? null;
}

/** Tạo URL có chữ ký để hiển thị ảnh trong bucket riêng tư. */
export async function createAvatarUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** URL hiển thị của một tài khoản; trả về null nếu chưa có ảnh hoặc ảnh lỗi. */
export async function fetchAvatarUrl(userId: string): Promise<string | null> {
  const path = await fetchAvatarPath(userId);
  if (!path) return null;
  return createAvatarUrl(path);
}

export const avatarUrlQuery = (userId: string | null | undefined) =>
  queryOptions({
    queryKey: ["avatar-url", userId],
    queryFn: () => fetchAvatarUrl(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });

/**
 * Tải ảnh mới lên và cập nhật hồ sơ.
 * Ghi đè đúng một đường dẫn để không tạo file rác; lỗi upload giữ nguyên ảnh cũ.
 */
export async function uploadMyAvatar(userId: string, file: File): Promise<string> {
  const invalid = validateAvatarFile(file);
  if (invalid) throw new Error(invalid);

  const path = avatarPathFor(userId);
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "0" });
  if (uploadError) {
    throw new Error(
      /row-level security|not authorized|permission/i.test(uploadError.message)
        ? "Bạn chỉ được cập nhật ảnh đại diện của chính mình."
        : `Không tải được ảnh lên: ${uploadError.message}`,
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId);
  if (profileError) throw new Error(`Không lưu được ảnh vào hồ sơ: ${profileError.message}`);

  const url = await createAvatarUrl(path);
  if (!url) throw new Error("Đã lưu ảnh nhưng chưa hiển thị được. Vui lòng tải lại trang.");
  return url;
}
