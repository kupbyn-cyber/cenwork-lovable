BEGIN;
ALTER TABLE public.projects DISABLE TRIGGER USER;
ALTER TABLE public.project_teams DISABLE TRIGGER USER;
ALTER TABLE public.project_members DISABLE TRIGGER USER;
ALTER TABLE public.tasks DISABLE TRIGGER USER;

CREATE TEMP TABLE demo_u(code text primary key, uid uuid, team uuid, proj uuid, leader uuid) ON COMMIT DROP;
INSERT INTO demo_u VALUES
('branding.leader','7d81dd7b-454d-407f-a584-16e7e7ac9e09','a1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','7d81dd7b-454d-407f-a584-16e7e7ac9e09'),
('branding.member01','dcf42b88-1428-4e88-b442-afd84af56b0c','a1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','7d81dd7b-454d-407f-a584-16e7e7ac9e09'),
('branding.member02','6b074455-ba94-4873-bda8-e5fb7ab65620','a1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','7d81dd7b-454d-407f-a584-16e7e7ac9e09'),
('design.leader','621ebfc0-afc5-4732-82ea-8279839dcc40','a1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','621ebfc0-afc5-4732-82ea-8279839dcc40'),
('design.member01','3420be0a-cb6b-4005-9f98-3b35b8f836e0','a1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','621ebfc0-afc5-4732-82ea-8279839dcc40'),
('editor.leader','60d89f80-e736-413c-894d-bb608e59c7cb','a1000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000003','60d89f80-e736-413c-894d-bb608e59c7cb'),
('editor.member01','d83a6a22-f988-4858-9606-46505bc12f78','a1000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000003','60d89f80-e736-413c-894d-bb608e59c7cb'),
('editor.member02','bb7c77f9-4791-4d53-b5d0-bb66ee486494','a1000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000003','60d89f80-e736-413c-894d-bb608e59c7cb'),
('trade.leader','c3b4e388-6d0c-4863-bf58-fcbf4f502be0','a1000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000004','c3b4e388-6d0c-4863-bf58-fcbf4f502be0'),
('trade.member01','3a3ec97f-9239-412c-84e6-29ee0e076ddf','a1000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000004','c3b4e388-6d0c-4863-bf58-fcbf4f502be0');

INSERT INTO public.projects (id,name,objective,description,owner_id,start_date,deadline,status,created_by,responsible_team_id,submitted_at,approved_at,approved_by,approval_round,created_at,updated_at)
VALUES
('b2000000-0000-4000-8000-000000000001','[DEMO] Branding – Bộ nhận diện Thu Đông','Chuẩn hóa bộ nhận diện cho mùa Thu Đông','Dữ liệu DEMO phục vụ kiểm thử.','7d81dd7b-454d-407f-a584-16e7e7ac9e09','2026-07-06','2026-09-30','in_progress','7d81dd7b-454d-407f-a584-16e7e7ac9e09','a1000000-0000-4000-8000-000000000001','2026-07-06 09:00+07','2026-07-06 10:00+07','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961',1,'2026-07-06 09:00+07','2026-07-06 10:00+07'),
('b2000000-0000-4000-8000-000000000002','[DEMO] Design – Thư viện visual chiến dịch','Xây thư viện visual dùng chung','Dữ liệu DEMO phục vụ kiểm thử.','621ebfc0-afc5-4732-82ea-8279839dcc40','2026-07-06','2026-09-30','in_progress','621ebfc0-afc5-4732-82ea-8279839dcc40','a1000000-0000-4000-8000-000000000002','2026-07-06 09:00+07','2026-07-06 10:00+07','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961',1,'2026-07-06 09:00+07','2026-07-06 10:00+07'),
('b2000000-0000-4000-8000-000000000003','[DEMO] Editor – Series video thương hiệu','Sản xuất series video thương hiệu','Dữ liệu DEMO phục vụ kiểm thử.','60d89f80-e736-413c-894d-bb608e59c7cb','2026-07-06','2026-09-30','in_progress','60d89f80-e736-413c-894d-bb608e59c7cb','a1000000-0000-4000-8000-000000000003','2026-07-06 09:00+07','2026-07-06 10:00+07','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961',1,'2026-07-06 09:00+07','2026-07-06 10:00+07'),
('b2000000-0000-4000-8000-000000000004','[DEMO] Trade Marketing – Kích hoạt điểm bán','Triển khai kích hoạt tại điểm bán','Dữ liệu DEMO phục vụ kiểm thử.','c3b4e388-6d0c-4863-bf58-fcbf4f502be0','2026-07-06','2026-09-30','in_progress','c3b4e388-6d0c-4863-bf58-fcbf4f502be0','a1000000-0000-4000-8000-000000000004','2026-07-06 09:00+07','2026-07-06 10:00+07','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961',1,'2026-07-06 09:00+07','2026-07-06 10:00+07');

INSERT INTO public.project_teams (project_id,team_id) SELECT DISTINCT proj, team FROM demo_u;
INSERT INTO public.project_members (project_id,user_id) SELECT proj, uid FROM demo_u;

INSERT INTO public.tasks (id,name,description,project_id,assignee_id,team_id,start_date,deadline,priority,status,created_by,created_at,updated_at,completed_at)
SELECT
  ('c3000000-0000-4000-8000-' || lpad(v.n::text,12,'0'))::uuid,
  '[DEMO] Công việc ' || lpad(v.n::text,2,'0'),
  'Dữ liệu DEMO phục vụ kiểm thử.',
  u.proj, u.uid, u.team, v.sd::date, v.dl::timestamptz, v.pr::task_priority, v.st::task_status,
  u.leader, (v.sd || ' 09:00+07')::timestamptz, v.upd::timestamptz, v.comp::timestamptz
FROM (VALUES
(1,'branding.member01','2026-07-03','2026-07-08 17:00+07','high','done','2026-07-07 16:00+07','2026-07-07 16:00+07'),
(2,'editor.member01','2026-07-04','2026-07-09 17:00+07','medium','done','2026-07-08 16:00+07','2026-07-08 16:00+07'),
(3,'design.member01','2026-07-05','2026-07-10 17:00+07','low','done','2026-07-09 16:00+07','2026-07-09 16:00+07'),
(4,'trade.member01','2026-07-05','2026-07-10 17:00+07','medium','done','2026-07-12 16:00+07','2026-07-12 16:00+07'),
(5,'branding.member02','2026-07-04','2026-07-09 17:00+07','medium','in_progress',NULL,'2026-07-04 09:00+07'),
(6,'branding.member01','2026-07-10','2026-07-15 17:00+07','medium','done','2026-07-14 16:00+07','2026-07-14 16:00+07'),
(7,'branding.leader','2026-07-11','2026-07-16 17:00+07','high','done','2026-07-15 16:00+07','2026-07-15 16:00+07'),
(8,'editor.leader','2026-07-11','2026-07-16 17:00+07','medium','done','2026-07-15 16:00+07','2026-07-15 16:00+07'),
(9,'editor.member02','2026-07-12','2026-07-17 17:00+07','high','in_progress',NULL,'2026-07-12 09:00+07'),
(10,'design.member01','2026-07-12','2026-07-17 17:00+07','medium','done','2026-07-16 16:00+07','2026-07-16 16:00+07'),
(11,'trade.member01','2026-07-10','2026-07-15 17:00+07','low','done','2026-07-18 16:00+07','2026-07-18 16:00+07'),
(12,'branding.member02','2026-07-11','2026-07-16 17:00+07','low','not_started',NULL,'2026-07-11 09:00+07'),
(13,'branding.member01','2026-07-16','2026-07-21 17:00+07','high','done','2026-07-20 16:00+07','2026-07-20 16:00+07'),
(14,'branding.member01','2026-07-18','2026-07-23 17:00+07','medium','done','2026-07-22 16:00+07','2026-07-22 16:00+07'),
(15,'branding.member02','2026-07-17','2026-07-22 17:00+07','medium','in_progress',NULL,'2026-07-17 09:00+07'),
(16,'branding.member02','2026-07-19','2026-07-24 17:00+07','low','review',NULL,'2026-07-19 09:00+07'),
(17,'branding.leader','2026-07-18','2026-07-23 17:00+07','high','review',NULL,'2026-07-18 09:00+07'),
(18,'design.member01','2026-07-17','2026-07-22 17:00+07','high','done','2026-07-21 16:00+07','2026-07-21 16:00+07'),
(19,'design.leader','2026-07-19','2026-07-24 17:00+07','medium','in_progress',NULL,'2026-07-19 09:00+07'),
(20,'editor.member01','2026-07-16','2026-07-21 17:00+07','medium','done','2026-07-23 16:00+07','2026-07-23 16:00+07'),
(21,'editor.member02','2026-07-18','2026-07-23 17:00+07','high','not_started',NULL,'2026-07-18 09:00+07'),
(22,'editor.leader','2026-07-19','2026-07-24 17:00+07','medium','review',NULL,'2026-07-19 09:00+07'),
(23,'trade.member01','2026-07-17','2026-07-22 17:00+07','high','in_progress',NULL,'2026-07-17 09:00+07'),
(24,'trade.leader','2026-07-19','2026-07-24 17:00+07','medium','review',NULL,'2026-07-19 09:00+07'),
(25,'branding.member01','2026-07-31','2026-08-05 17:00+07','medium','in_progress',NULL,'2026-07-31 09:00+07'),
(26,'branding.member02','2026-08-01','2026-08-06 17:00+07','low','not_started',NULL,'2026-08-01 09:00+07'),
(27,'design.member01','2026-07-30','2026-08-04 17:00+07','high','review',NULL,'2026-07-30 09:00+07'),
(28,'editor.member01','2026-08-02','2026-08-07 17:00+07','medium','in_progress',NULL,'2026-08-02 09:00+07'),
(29,'editor.member02','2026-07-31','2026-08-05 17:00+07','medium','not_started',NULL,'2026-07-31 09:00+07'),
(30,'trade.member01','2026-08-01','2026-08-06 17:00+07','low','not_started',NULL,'2026-08-01 09:00+07'),
(31,'design.leader','2026-08-02','2026-08-07 17:00+07','medium','not_started',NULL,'2026-08-02 09:00+07'),
(32,'editor.leader','2026-07-30','2026-08-04 17:00+07','high','in_progress',NULL,'2026-07-30 09:00+07')
) AS v(n,code,sd,dl,pr,st,comp,upd)
JOIN demo_u u ON u.code = v.code;

ALTER TABLE public.tasks ENABLE TRIGGER USER;
ALTER TABLE public.project_members ENABLE TRIGGER USER;
ALTER TABLE public.project_teams ENABLE TRIGGER USER;
ALTER TABLE public.projects ENABLE TRIGGER USER;
COMMIT;