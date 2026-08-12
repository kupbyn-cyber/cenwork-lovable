INSERT INTO public.app_settings (key, value, description)
VALUES ('app_base_url', jsonb_build_object('text','https://cenwork.tudogroup.vn'),
        'Địa chỉ CEN dùng để dựng link đầy đủ trong Telegram')
ON CONFLICT (key) DO NOTHING;

UPDATE public.app_settings
   SET value = jsonb_build_object('text','https://cenwork.tudogroup.vn')
 WHERE key = 'app_base_url'
   AND COALESCE(value->>'text','') ILIKE '%lovable.app%';

CREATE OR REPLACE FUNCTION public.app_base_url()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT rtrim(
    COALESCE(NULLIF(btrim((SELECT value->>'text' FROM public.app_settings WHERE key='app_base_url')),''),
             'https://cenwork.tudogroup.vn'), '/');
$$;

CREATE OR REPLACE FUNCTION public.telegram_escape_html(_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT replace(replace(replace(COALESCE(_text,''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

CREATE OR REPLACE FUNCTION public.telegram_compose(_event text, _title text, _body text, _link text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.telegram_icon(COALESCE(_event,'')) || ' CEN WORK'
      || E'\n<b>' || public.telegram_escape_html(COALESCE(NULLIF(btrim(_title),''),'Thông báo từ CEN')) || '</b>'
      || CASE WHEN COALESCE(btrim(_body),'') = '' THEN ''
              ELSE E'\n' || (
                SELECT string_agg('<b>' || public.telegram_escape_html(line) || '</b>', E'\n')
                  FROM regexp_split_to_table(btrim(_body), E'\n') AS line
              ) END
      || E'\nXem chi tiết:\n'
      || CASE WHEN COALESCE(btrim(_link),'') = '' THEN public.app_base_url() || '/'
              WHEN btrim(_link) LIKE 'http%' THEN public.telegram_escape_html(btrim(_link))
              ELSE public.telegram_escape_html(public.app_base_url() || '/' || ltrim(btrim(_link), '/')) END;
$$;