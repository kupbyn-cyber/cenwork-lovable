INSERT INTO public.app_settings (key, value, description)
VALUES (
  'daily_task_report',
  jsonb_build_object('enabled', false, 'recipient_email', NULL, 'send_time', '06:30'),
  'Cấu hình gửi báo cáo công việc hằng ngày qua email (TASK-DAILY-01B)'
)
ON CONFLICT (key) DO NOTHING;