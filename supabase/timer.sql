-- Questlog timer: every 10 minutes, ask GitHub to run the ping workflow.
-- GitHub's own schedule is unreliable for new repos; Supabase's pg_cron is precise.
-- setup-timer.sh fills in __TOKEN__ (a fine-grained token that can only run this repo's workflows).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'questlog_github_token';
  if sid is null then
    perform vault.create_secret('__TOKEN__', 'questlog_github_token', 'Starts the Questlog ping workflow on GitHub');
  else
    perform vault.update_secret(sid, '__TOKEN__');
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'questlog-pings';

select cron.schedule('questlog-pings', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://api.github.com/repos/m-a-r-k-o-r/questlog/actions/workflows/pings.yml/dispatches',
    body := '{"ref": "main", "inputs": {"mode": "auto"}}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'questlog_github_token'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'questlog-timer',
      'X-GitHub-Api-Version', '2022-11-28'
    ),
    timeout_milliseconds := 10000
  );
$job$);
