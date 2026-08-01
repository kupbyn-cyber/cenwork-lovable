BEGIN;
ALTER TABLE public.announcements DISABLE TRIGGER USER;
ALTER TABLE public.announcement_targets DISABLE TRIGGER USER;
ALTER TABLE public.announcement_recipients DISABLE TRIGGER USER;
ALTER TABLE public.recognitions DISABLE TRIGGER USER;
ALTER TABLE public.mvp_cycles DISABLE TRIGGER USER;
ALTER TABLE public.mvp_votes DISABLE TRIGGER USER;
ALTER TABLE public.mvp_manual_reviews DISABLE TRIGGER USER;

CREATE TEMP TABLE demo_u(code text primary key, uid uuid, team uuid) ON COMMIT DROP;
INSERT INTO demo_u VALUES
('BL','7d81dd7b-454d-407f-a584-16e7e7ac9e09','a1000000-0000-4000-8000-000000000001'),
('BM1','dcf42b88-1428-4e88-b442-afd84af56b0c','a1000000-0000-4000-8000-000000000001'),
('BM2','6b074455-ba94-4873-bda8-e5fb7ab65620','a1000000-0000-4000-8000-000000000001'),
('DL','621ebfc0-afc5-4732-82ea-8279839dcc40','a1000000-0000-4000-8000-000000000002'),
('DM1','3420be0a-cb6b-4005-9f98-3b35b8f836e0','a1000000-0000-4000-8000-000000000002'),
('EL','60d89f80-e736-413c-894d-bb608e59c7cb','a1000000-0000-4000-8000-000000000003'),
('EM1','d83a6a22-f988-4858-9606-46505bc12f78','a1000000-0000-4000-8000-000000000003'),
('EM2','bb7c77f9-4791-4d53-b5d0-bb66ee486494','a1000000-0000-4000-8000-000000000003'),
('TL','c3b4e388-6d0c-4863-bf58-fcbf4f502be0','a1000000-0000-4000-8000-000000000004'),
('TM1','3a3ec97f-9239-412c-84e6-29ee0e076ddf','a1000000-0000-4000-8000-000000000004');

INSERT INTO public.announcements (id,created_by,title,body,status,due_at,published_at,audience_all_users,created_at,updated_at) VALUES
('d4000000-0000-4000-8000-000000000001','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961','[DEMO] Quy trình bàn giao nội dung tuần 30','[DEMO] Nội dung thông báo bắt buộc xác nhận.','published','2026-07-22 17:00+07','2026-07-20 09:00+07',false,'2026-07-20 09:00+07','2026-07-20 09:00+07'),
('d4000000-0000-4000-8000-000000000002','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961','[DEMO] Cập nhật lịch họp giao ban','[DEMO] Nội dung thông báo bắt buộc xác nhận.','published','2026-07-24 17:00+07','2026-07-20 09:00+07',false,'2026-07-20 09:00+07','2026-07-20 09:00+07');

INSERT INTO public.announcement_targets (announcement_id,target_type,target_id)
SELECT a.id,'user',u.uid FROM (VALUES ('d4000000-0000-4000-8000-000000000001'::uuid),('d4000000-0000-4000-8000-000000000002')) a(id) CROSS JOIN demo_u u;

INSERT INTO public.announcement_recipients (announcement_id,user_id,status,due_at,first_opened_at,read_completed_at,acknowledged_at,is_late,created_at,updated_at)
SELECT a.id, u.uid,
  CASE WHEN u.code IN ('BM2','EM2') THEN 'unread'::announcement_recipient_status ELSE 'completed' END,
  a.due,
  CASE WHEN u.code IN ('BM2','EM2') THEN NULL WHEN u.code IN ('EM1','TM1','DL') THEN a.due + interval '18 hours' ELSE a.due - interval '31 hours' END,
  CASE WHEN u.code IN ('BM2','EM2') THEN NULL WHEN u.code IN ('EM1','TM1','DL') THEN a.due + interval '18 hours' ELSE a.due - interval '31 hours' END,
  CASE WHEN u.code IN ('BM2','EM2') THEN NULL WHEN u.code IN ('EM1','TM1','DL') THEN a.due + interval '18 hours' ELSE a.due - interval '31 hours' END,
  CASE WHEN u.code IN ('EM1','TM1','DL') THEN true ELSE false END,
  '2026-07-20 09:00+07','2026-07-26 09:00+07'
FROM (VALUES ('d4000000-0000-4000-8000-000000000001'::uuid,'2026-07-22 17:00+07'::timestamptz),('d4000000-0000-4000-8000-000000000002','2026-07-24 17:00+07')) a(id,due)
CROSS JOIN demo_u u;

INSERT INTO public.recognitions (sender_id,receiver_id,category,message,relation_type,sender_team_id,receiver_team_id,created_at,updated_at)
SELECT s.uid, r.uid, v.cat::recognition_category, '[DEMO] Cảm ơn bạn đã hỗ trợ rất nhiệt tình trong tuần.', 'same_team', s.team, r.team, v.d::timestamptz, v.d::timestamptz
FROM (VALUES
('BL','BM1','quality','2026-07-21 15:00+07'),
('BM2','BM1','support','2026-07-22 15:00+07'),
('DL','DM1','initiative','2026-07-22 15:00+07'),
('EM1','EL','teamwork','2026-07-23 15:00+07'),
('EM2','EL','speed','2026-07-23 15:00+07'),
('TL','TM1','support','2026-07-24 15:00+07'),
('BM1','BL','teamwork','2026-07-24 15:00+07'),
('DM1','DL','quality','2026-07-25 15:00+07'),
('EL','EM1','initiative','2026-07-25 15:00+07'),
('BL','BM2','support','2026-07-25 16:00+07')
) v(sc,rc,cat,d) JOIN demo_u s ON s.code=v.sc JOIN demo_u r ON r.code=v.rc;

INSERT INTO public.mvp_cycles (id,week_start,week_end,status,vote_opens_at,vote_closes_at,data_locked_at,created_by,created_at,updated_at) VALUES
('e5000000-0000-4000-8000-000000000002','2026-07-13','2026-07-19','reviewing','2026-07-18 09:00+07','2026-07-20 17:00+07','2026-07-20 00:00+07','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961','2026-07-13 09:00+07','2026-07-20 09:00+07'),
('e5000000-0000-4000-8000-000000000003','2026-07-20','2026-07-26','reviewing','2026-07-25 09:00+07','2026-07-27 17:00+07','2026-07-27 00:00+07','4bbc5895-3a0c-4c4e-aaef-e8d75ced5961','2026-07-20 09:00+07','2026-07-27 09:00+07');

INSERT INTO public.mvp_votes (cycle_id,voter_id,votee_id,reason,is_valid,created_at)
SELECT 'e5000000-0000-4000-8000-000000000003', a.uid, b.uid, '[DEMO] Đồng đội hỗ trợ nhiệt tình và hoàn thành công việc đúng hạn.', true, '2026-07-25 14:00+07'
FROM (VALUES ('BL','BM1'),('BM1','BL'),('BM2','BM1'),('DL','DM1'),('DM1','DL'),('EL','EM1'),('EM1','EL'),('EM2','EL'),('TL','TM1'),('TM1','BM1')) v(x,y)
JOIN demo_u a ON a.code=v.x JOIN demo_u b ON b.code=v.y;

INSERT INTO public.mvp_manual_reviews (cycle_id,subject_id,reviewer_id,quality_score,proactive_score,teamwork_score,reason,evidence,status,submitted_at,created_at,updated_at)
SELECT 'e5000000-0000-4000-8000-000000000003', s.uid,
       COALESCE(r.uid,'4bbc5895-3a0c-4c4e-aaef-e8d75ced5961'::uuid), v.q, v.p, v.t,
       '[DEMO] Đánh giá thực tế của người quản lý trực tiếp.',
       '[DEMO] Bằng chứng: kết quả công việc và phản hồi đồng đội trong tuần.',
       'submitted','2026-07-26 10:00+07','2026-07-26 10:00+07','2026-07-26 10:00+07'
FROM (VALUES
('BM1','BL',10,10,5),('BM2','BL',5,2.5,2.5),('DM1','DL',7.5,7.5,3.75),('EM1','EL',7.5,5,3.75),
('EM2','EL',2.5,2.5,1.25),('TM1','TL',5,7.5,2.5),('BL',NULL,7.5,7.5,3.75),('DL',NULL,5,5,2.5),
('EL',NULL,10,7.5,5),('TL',NULL,5,2.5,2.5)
) v(sc,rc,q,p,t)
JOIN demo_u s ON s.code=v.sc LEFT JOIN demo_u r ON r.code=v.rc;

ALTER TABLE public.mvp_manual_reviews ENABLE TRIGGER USER;
ALTER TABLE public.mvp_votes ENABLE TRIGGER USER;
ALTER TABLE public.mvp_cycles ENABLE TRIGGER USER;
ALTER TABLE public.recognitions ENABLE TRIGGER USER;
ALTER TABLE public.announcement_recipients ENABLE TRIGGER USER;
ALTER TABLE public.announcement_targets ENABLE TRIGGER USER;
ALTER TABLE public.announcements ENABLE TRIGGER USER;
COMMIT;