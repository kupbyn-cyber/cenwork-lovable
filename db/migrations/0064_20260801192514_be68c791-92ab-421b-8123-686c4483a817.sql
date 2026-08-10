CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('report-reminder-evening', '0 13 * * *', $$SELECT public.report_run_reminders();$$);
SELECT cron.schedule('report-reminder-overdue', '5 17 * * *', $$SELECT public.report_run_reminders();$$);
SELECT cron.schedule('report-reminder-morning', '0 1 * * *',  $$SELECT public.report_run_reminders();$$);