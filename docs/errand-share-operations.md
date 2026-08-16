# Errand-Share operations

Errand-Share automatically pairs compatible Today and Whenever errands before
runner matching. ASAP Express and manual-runner errands bypass sharing. This
runbook covers the scheduled release path and the evidence boundary for the
deterministic evaluation.

## Required server configuration

Set `ERRAND_SHARE_CRON_SECRET` to a long, random value in every deployed app
environment. It is server-only: do not prefix it with `NEXT_PUBLIC_`, expose it
to browser code, print it in logs, or commit its value. The endpoint returns
`503` when the setting is absent and `401` for an invalid bearer token.

The protected sweep is:

```text
GET /api/internal/errand-share/sweep
Authorization: Bearer <ERRAND_SHARE_CRON_SECRET>
```

Each invocation claims at most 25 due errands. Run it once per minute. The
database claims work atomically, so overlapping calls and retries do not release
the same errand twice. An expired pair is dissolved atomically; an expired
single errand is released to fresh ordinary matching. Posting a later eligible
errand also processes due windows as a request-time fallback, but that fallback
does not replace the scheduler.

## Supabase scheduler

Enable the `pg_cron`, `pg_net`, and Vault integrations for the project. Store
the production app origin and the same scheduler secret in Vault; the following
names are examples and the values must be entered directly in the Supabase SQL
editor, never committed:

```sql
select vault.create_secret('https://YOUR_APP_ORIGIN', 'errand_share_base_url');
select vault.create_secret('YOUR_RANDOM_SECRET', 'errand_share_cron_secret');
```

Schedule the HTTPS request once per minute:

```sql
select cron.schedule(
  'errand-share-sweep',
  '* * * * *',
  $$
  select net.http_get(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'errand_share_base_url'
    ) || '/api/internal/errand-share/sweep',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'errand_share_cron_secret'
      )
    )
  );
  $$
);
```

Confirm the job exists and inspect recent executions:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'errand-share-sweep';

select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'errand-share-sweep'
)
order by start_time desc
limit 20;
```

`cron.job_run_details` confirms that cron submitted the `pg_net` request. Use
application request logs to confirm the returned HTTP status and sweep result.
After changing the app origin or secret, update the Vault values and test a
manual request before relying on the next scheduled run.

## Manual validation

From a trusted shell with the secret loaded locally, call the deployment:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ERRAND_SHARE_CRON_SECRET" \
  https://YOUR_APP_ORIGIN/api/internal/errand-share/sweep
```

A successful response reports how many expired groups and single tasks were
claimed and processed. Repeating the call is safe; already-claimed work is not
processed again. Never paste the real secret into tickets, screenshots, command
history examples, or CI logs.

## Reproducible simulated evaluation

Generate the checked-in JSON and Markdown reports with:

```bash
npm run evaluate:errand-share
```

The command uses a fixed seed, a fixed 1,000-errand Accra-area dataset, and the
production route-ranking function. Running it twice must produce byte-identical
`reports/errand-share/simulation.json` and
`reports/errand-share/simulation.md`. Report generation fails if an accepted
route violates a deadline or detour constraint.

All generated cancellation, completion, pairing, distance, and detour values
are explicitly **simulated evidence**. They demonstrate determinism and enforce
algorithm invariants; they do not prove savings, completion, fairness, demand,
or customer outcomes in production. Real claims must be validated separately
from versioned production decision, match, cancellation, and completion
telemetry after a sufficiently representative observation period.
