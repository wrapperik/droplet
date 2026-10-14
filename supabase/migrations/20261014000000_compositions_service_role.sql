-- The `compose` Edge Function counts a founder's requests in `compositions` (the hourly limit and the Advanced allowance) and writes a row
-- for each request, with the project's service role key. The earlier migrations relied on Supabase's default grants to `service_role`,
-- which this project does not have, so the count was refused ("permission denied for table compositions") and every chat failed with a 500.
-- Only what the function does is granted: read to count, insert to log. Nothing is granted to `anon` or `authenticated` here.

grant select, insert on public.compositions to service_role;
