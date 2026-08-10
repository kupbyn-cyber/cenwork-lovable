-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'cmo', 'leader', 'member');
CREATE TYPE public.account_status AS ENUM ('active', 'locked');

-- ============ TABLES ============
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  leader_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teams_name_unique ON public.teams (lower(name));
CREATE UNIQUE INDEX teams_leader_unique ON public.teams (leader_id) WHERE leader_id IS NOT NULL;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  job_title text,
  primary_team_id uuid REFERENCES public.teams(id) ON DELETE RESTRICT,
  status public.account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_email_unique ON public.profiles (lower(email));
CREATE INDEX profiles_primary_team_idx ON public.profiles (primary_team_id);

ALTER TABLE public.teams
  ADD CONSTRAINT teams_leader_fk FOREIGN KEY (leader_id)
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.team_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX facilities_name_unique ON public.facilities (lower(name));

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, DELETE ON public.team_collaborators TO authenticated;
GRANT ALL ON public.team_collaborators TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.facilities TO authenticated;
GRANT ALL ON public.facilities TO service_role;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Team mà người dùng đang làm Leader (tối đa 1).
CREATE OR REPLACE FUNCTION public.leader_team_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id FROM public.teams t WHERE t.leader_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_primary_team_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.primary_team_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- Người dùng hiện tại được phép quản lý hồ sơ _target?
CREATE OR REPLACE FUNCTION public.can_manage_profile(_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'cmo')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _target
          AND p.primary_team_id IS NOT NULL
          AND p.primary_team_id = public.leader_team_id(auth.uid())
      );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER facilities_set_updated_at BEFORE UPDATE ON public.facilities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Hồ sơ được tạo tự động khi tài khoản Auth được tạo từ backend.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''), split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ràng buộc cột nhạy cảm khi cập nhật hồ sơ.
CREATE OR REPLACE FUNCTION public.enforce_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- thao tác từ backend tin cậy
  END IF;
  IF NEW.id <> OLD.id OR lower(NEW.email) <> lower(OLD.email) THEN
    RAISE EXCEPTION 'Không được đổi định danh hoặc email của tài khoản';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Chỉ Admin được đổi trạng thái tài khoản';
  END IF;
  IF NEW.primary_team_id IS DISTINCT FROM OLD.primary_team_id
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cmo')) THEN
    RAISE EXCEPTION 'Chỉ Admin hoặc CMO được đổi Team chính';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER profiles_enforce_update BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_update();

-- Một người chỉ làm Leader của một Team và phải là thành viên hợp lệ.
CREATE OR REPLACE FUNCTION public.enforce_team_leader()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.leader_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.leader_id = NEW.leader_id AND t.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Người này đã là Leader của một Team khác';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER teams_enforce_leader BEFORE INSERT OR UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_leader();

-- Team phối hợp không được trùng Team chính.
CREATE OR REPLACE FUNCTION public.enforce_collaborator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.primary_team_id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'Đây đã là Team chính của thành viên';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER team_collaborators_enforce BEFORE INSERT OR UPDATE ON public.team_collaborators
FOR EACH ROW EXECUTE FUNCTION public.enforce_collaborator();

-- ============ RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_self" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_managed" ON public.profiles
FOR SELECT TO authenticated USING (public.can_manage_profile(id));
CREATE POLICY "profiles_update_self" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_managed" ON public.profiles
FOR UPDATE TO authenticated USING (public.can_manage_profile(id)) WITH CHECK (public.can_manage_profile(id));

-- user_roles
CREATE POLICY "user_roles_select_self" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_select_privileged" ON public.user_roles
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'cmo')
  OR public.has_role(auth.uid(), 'leader')
);

-- teams
CREATE POLICY "teams_select_privileged" ON public.teams
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cmo')
);
CREATE POLICY "teams_select_own" ON public.teams
FOR SELECT TO authenticated USING (
  leader_id = auth.uid()
  OR id = public.my_primary_team_id()
  OR EXISTS (
    SELECT 1 FROM public.team_collaborators tc
    WHERE tc.team_id = teams.id AND tc.user_id = auth.uid()
  )
);
CREATE POLICY "teams_insert_admin" ON public.teams
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_update_admin" ON public.teams
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- team_collaborators
CREATE POLICY "team_collaborators_select_self" ON public.team_collaborators
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "team_collaborators_select_managed" ON public.team_collaborators
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'cmo')
  OR team_id = public.leader_team_id(auth.uid())
);
CREATE POLICY "team_collaborators_write_managed" ON public.team_collaborators
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'cmo')
  OR team_id = public.leader_team_id(auth.uid())
);
CREATE POLICY "team_collaborators_delete_managed" ON public.team_collaborators
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'cmo')
  OR team_id = public.leader_team_id(auth.uid())
);

-- facilities
CREATE POLICY "facilities_select_authenticated" ON public.facilities
FOR SELECT TO authenticated USING (true);
CREATE POLICY "facilities_insert_admin" ON public.facilities
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "facilities_update_admin" ON public.facilities
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));