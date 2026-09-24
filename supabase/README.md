# Облачный backend Звонка

Здесь находится Supabase Edge Function `api`. Она сохраняет FCM-токены в Postgres, отдаёт расписание и каждую минуту отправляет уведомления за 5 минут до урока и за 2 минуты до перемены.

## Первый запуск

В корне проекта:

```bash
npx supabase login
npx supabase link --project-ref ghyyogihckfwyfsrkgwp
npx supabase db push
npx supabase functions deploy api --no-verify-jwt
```

В Supabase Dashboard → Edge Functions → `api` → Secrets добавь:

- `ADMIN_API_KEY` — любой длинный случайный ключ для админских запросов;
- `SCHEDULER_SECRET` — отдельный длинный случайный ключ для cron;
- `FIREBASE_SERVICE_ACCOUNT_JSON` — содержимое Firebase service-account JSON. Это тот же приватный ключ, который уже лежит локально; его нельзя добавлять в APK или Git.

После добавления секретов перезапусти функцию.

## Cron раз в минуту

Если SQL Editor пишет `schema "cron" does not exist`, сначала один раз включи расширения:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

В SQL Editor выполни, заменив `SCHEDULER_SECRET_VALUE` на значение секрета:

```sql
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'zvonok_project_url'
  ) then
    perform vault.create_secret('https://ghyyogihckfwyfsrkgwp.supabase.co', 'zvonok_project_url');
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'zvonok_scheduler_secret'
  ) then
    perform vault.create_secret('SCHEDULER_SECRET_VALUE', 'zvonok_scheduler_secret');
  end if;
end $$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'zvonok-schedule-notifications';

select cron.schedule(
  'zvonok-schedule-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'zvonok_project_url') || '/functions/v1/api?route=scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zvonok_scheduler_secret')
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $$
);
```

Проверка:

```bash
curl 'https://ghyyogihckfwyfsrkgwp.supabase.co/functions/v1/api/health'
```
