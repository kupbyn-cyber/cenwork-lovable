BEGIN;
ALTER TABLE public.daily_reports DISABLE TRIGGER USER;
ALTER TABLE public.weekly_reports DISABLE TRIGGER USER;
WITH plan(uid, team, days) AS (VALUES
  ('dcf42b88-1428-4e88-b442-afd84af56b0c'::uuid,'a1000000-0000-4000-8000-000000000001'::uuid,5),
  ('7d81dd7b-454d-407f-a584-16e7e7ac9e09','a1000000-0000-4000-8000-000000000001',5),
  ('6b074455-ba94-4873-bda8-e5fb7ab65620','a1000000-0000-4000-8000-000000000001',2),
  ('3420be0a-cb6b-4005-9f98-3b35b8f836e0','a1000000-0000-4000-8000-000000000002',5),
  ('621ebfc0-afc5-4732-82ea-8279839dcc40','a1000000-0000-4000-8000-000000000002',4),
  ('60d89f80-e736-413c-894d-bb608e59c7cb','a1000000-0000-4000-8000-000000000003',5),
  ('d83a6a22-f988-4858-9606-46505bc12f78','a1000000-0000-4000-8000-000000000003',4),
  ('bb7c77f9-4791-4d53-b5d0-bb66ee486494','a1000000-0000-4000-8000-000000000003',2),
  ('c3b4e388-6d0c-4863-bf58-fcbf4f502be0','a1000000-0000-4000-8000-000000000004',3),
  ('3a3ec97f-9239-412c-84e6-29ee0e076ddf','a1000000-0000-4000-8000-000000000004',3)
), wk(ws) AS (VALUES ('2026-07-06'::date),('2026-07-13'),('2026-07-20'),('2026-07-27'))
INSERT INTO public.daily_reports (report_date,author_id,team_id,results,next_plan,status,submitted_at,created_at,updated_at)
SELECT wk.ws + g.i, p.uid, p.team, '[DEMO] Kết quả trong ngày.', '[DEMO] Kế hoạch ngày mai.', 'submitted',
       (wk.ws + g.i) + time '17:30', (wk.ws + g.i) + time '17:30', (wk.ws + g.i) + time '17:30'
FROM plan p CROSS JOIN wk CROSS JOIN LATERAL generate_series(0, p.days - 1) g(i)
WHERE wk.ws + g.i <= date '2026-07-31'
ON CONFLICT DO NOTHING;

WITH t(team, leader) AS (VALUES
  ('a1000000-0000-4000-8000-000000000001'::uuid,'7d81dd7b-454d-407f-a584-16e7e7ac9e09'::uuid),
  ('a1000000-0000-4000-8000-000000000002','621ebfc0-afc5-4732-82ea-8279839dcc40'),
  ('a1000000-0000-4000-8000-000000000003','60d89f80-e736-413c-894d-bb608e59c7cb'),
  ('a1000000-0000-4000-8000-000000000004','c3b4e388-6d0c-4863-bf58-fcbf4f502be0')
), wk(ws) AS (VALUES ('2026-07-06'::date),('2026-07-13'),('2026-07-20'))
INSERT INTO public.weekly_reports (team_id,week_start,leader_id,highlights,next_week_plan,status,submitted_at,created_at,updated_at)
SELECT t.team, wk.ws, t.leader, '[DEMO] Kết quả nổi bật của tuần.', '[DEMO] Kế hoạch tuần tới.', 'submitted',
       wk.ws + 4 + time '18:00', wk.ws + time '09:00', wk.ws + 4 + time '18:00'
FROM t CROSS JOIN wk
WHERE NOT (t.team = 'a1000000-0000-4000-8000-000000000004' AND wk.ws = date '2026-07-20')
ON CONFLICT DO NOTHING;
ALTER TABLE public.weekly_reports ENABLE TRIGGER USER;
ALTER TABLE public.daily_reports ENABLE TRIGGER USER;
COMMIT;