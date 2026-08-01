import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";

import { EntityAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cenToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import {
  AVATAR_ACCEPT_ATTR,
  avatarUrlQuery,
  uploadMyAvatar,
  validateAvatarFile,
} from "@/lib/avatar-data";

/**
 * CEN WORK — Đổi ảnh đại diện của chính người dùng đang đăng nhập.
 * Chỉ thao tác trên tài khoản hiện tại; Storage Policy mới là ràng buộc thật.
 */
export interface AvatarUploaderProps {
  displayName: string;
}

export function AvatarUploader({ displayName }: AvatarUploaderProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const avatar = useQuery(avatarUrlQuery(user?.id));
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const upload = useMutation({
    mutationFn: () => uploadMyAvatar(user!.id, file!),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: ["avatar-url"] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      cenToast.success("Đã cập nhật ảnh đại diện");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const shownSrc = preview ?? avatar.data ?? undefined;

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      <EntityAvatar
        name={displayName || user?.email || ""}
        size="lg"
        {...(shownSrc ? { src: shownSrc } : {})}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {file ? (
            <>
              <Button
                type="button"
                size="sm"
                loading={upload.isPending}
                onClick={() => upload.mutate()}
              >
                Lưu ảnh
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={upload.isPending}
                onClick={reset}
              >
                Hủy
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              <Camera />
              Đổi ảnh
            </Button>
          )}
        </div>
        <p className="text-helper text-text-muted">
          JPG, PNG hoặc WEBP, tối đa 5 MB. Ảnh mới sẽ thay thế ảnh hiện tại.
        </p>
        {error ? (
          <p role="alert" className="text-helper text-state-danger">
            {error}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT_ATTR}
          className="sr-only"
          aria-label="Chọn ảnh đại diện"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            if (!selected) return;
            const invalid = validateAvatarFile(selected);
            if (invalid) {
              setError(invalid);
              setFile(null);
              event.target.value = "";
              return;
            }
            setError(null);
            setFile(selected);
          }}
        />
      </div>
    </div>
  );
}
