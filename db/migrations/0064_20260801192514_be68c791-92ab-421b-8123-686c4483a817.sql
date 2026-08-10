-- CEN-MB-01: pg_cron là tùy chọn trên PostgreSQL thuần (dùng cron hệ thống nếu không có).
DO $cen$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END$cen$;

SELECT cron.schedule('report-reminder-evening', '0 13 * * *', $$SELECT public.report_run_reminders();$$);
SELECT cron.schedule('report-reminder-overdue', '5 17 * * *', $$SELECT public.report_run_reminders();$$);
SELECT cron.schedule('report-reminder-morning', '0 1 * * *',  $$SELECT public.report_run_reminders();$$);