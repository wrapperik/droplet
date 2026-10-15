# Deploying Droplet

Three things go live: the **`compose` Edge Function** in Supabase (the only place the Gemini key exists), the **`delete-account` Edge Function** (what the
account page's Delete account and data button calls) and the **web app** on Vercel. Do them in
this order. Set up Supabase first (`docs/supabase-setup.md`): the project, the keys in `.env`, and the first migration.

## 1. The record of compositions (one more migration)

In the Supabase dashboard, open **SQL Editor**, make a new query, paste `supabase/migrations/20261005000100_compositions.sql`, and run it.
It makes the `compositions` table the function writes to and counts from. It keeps no words of anyone's: only who asked, the task, how it went, the
model, and how long it took.

Then run `supabase/migrations/20261006000000_compositions_searched.sql` and `supabase/migrations/20261006000100_compositions_modes.sql`, in that order.
They add which mode a request asked for and which answered, whether it searched, and how many tokens it used. The function counts each founder's
Advanced answers from them. The token counts are for working out what the composer costs and are never shown to founders. Nothing of what was asked,
answered or searched for is kept. Run them before deploying the function: it writes these columns.

Then run `supabase/migrations/20261008000000_notes_kind.sql`. It lets a project hold one more kind of document, `notes`: Droplet's notebook on the project (an
index of what the workspaces hold, and a digest of each). The app writes it when the founder saves, unless they switch the notes off in the project brief.
The app and the database must agree on the kinds, so run it before deploying the app that writes them.

Then run `supabase/migrations/20261015000000_logo_kind.sql`. It lets a project hold one more kind of document, `logo`: the PNG or SVG (at most 1 MB) a founder
makes in another tool and adds on the logo handoff card. It is kept as a document like the rest, so row-level security keeps it to its owner and deleting the
account deletes it with everything else (the `delete-account` function needs no change). Run it before deploying the app that writes it; until then, adding a
logo on the deployed app says it could not be stored.

The `compose` function now also does background work for the app: a short memory of a chat that was left, and a digest of a workspace after a save. Both
are answered by the Quick model, never count against the Advanced allowance, count toward `COMPOSE_LIMIT_PER_HOUR`, and are logged in `compositions` with
their task and tokens but never what was written. A founder who saves often and changes chats often uses more of the hourly limit; raise it if needed.

## 2. The function

The function is generated from the app's own code, so it can never disagree with the app about what a valid turn is.

```
npm run build:edge       # writes supabase/functions/compose/index.ts (git-ignored, one self-contained file)
```

**Set its secrets** (once; they live in Supabase, never in the repo or the browser). The Gemini key is the only one that must be set:

```
npx supabase login
npx supabase link --project-ref untyznmtxgacrkogigar
npx supabase secrets set GEMINI_API_KEY=your-gemini-key
```

Optional secrets, the same names as in `.env.example`: `GEMINI_BASE_MODEL`, `GEMINI_ADVANCED_MODEL`, `GEMINI_BASE_THINKING`,
`GEMINI_ADVANCED_THINKING`, `COMPOSE_ADVANCED_PER_DAY` and `COMPOSE_LIMIT_PER_HOUR` (default 60 requests an hour for each founder).
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are given to the function by Supabase itself. `GEMINI_MODEL` still works as another name for
`GEMINI_ADVANCED_MODEL`, and `GEMINI_THINKING_LEVEL` for `GEMINI_ADVANCED_THINKING`.

**Quick and Advanced.** Every message is answered by the Quick model (`GEMINI_BASE_MODEL`, default `gemini-3.5-flash-lite`, thinking `low`), which
never searches and has no spare model. A founder can choose Advanced for the next message from the menu in the message bar: it uses
`GEMINI_ADVANCED_MODEL` (default `gemini-3.8-flash`) with Google Search, and each founder has `COMPOSE_ADVANCED_PER_DAY` Advanced answers (default 10,
`0` turns Advanced off) over a sliding 24 hours, counted from `compositions`. The app never switches Advanced on. When the allowance is used up the
function refuses an Advanced request before calling Google, says when one comes back, and Quick still answers. When Google cannot answer with the
Advanced model (its quota is used up, or it is overloaded) Quick answers instead, the reply says so, and it does not count against the founder.

```
npx supabase secrets set COMPOSE_ADVANCED_PER_DAY=10
```

Search only works on the Advanced model (`gemini-3.8-flash`), which can search and answer in the app's JSON in one request. On the free tier that
model allows only about 20 requests a day per key, and Google can refuse a request that uses search ("check your plan and billing details") while
the same request without search works: the app then answers that request without search and does not ask for search again for an hour. For
search to be there reliably the key needs billing. Each search counts against the key's free 5,000 searches a month (shared by the Gemini 3 models),
and past that it is billed. Google's terms require the search suggestions to be shown with any answer that used search, which the app does.

**Deploy:**

```
npm run deploy:compose
```

That builds the file and deploys it. To deploy without the command line, run `npm run build:edge`, then in the dashboard open **Edge Functions**,
make a function called `compose`, paste the whole of `supabase/functions/compose/index.ts`, and turn **Verify JWT** off (the function checks the
founder's token itself). After any change to the function's source, build and deploy again.

**What it does:** it only answers a signed-in founder (their token is checked with Supabase Auth, so an expired, forged or anonymous token gets a
401), holds each founder to an hour's worth of requests (counted from `compositions`, so it holds across every copy of the function), and records how
each request went. It never stores what was asked or answered.

**Check it**, with a founder's token from the browser (Application, Local Storage, the `sb-...-auth-token` entry, `access_token`):

```
curl -s https://untyznmtxgacrkogigar.supabase.co/functions/v1/compose \
  -H "authorization: Bearer YOUR_ACCESS_TOKEN" -H "content-type: application/json" \
  -d '{"intent":"a calm colour palette for a gift box business"}'
```

Without the header it answers `{"error":"unauthorised",...}` with a 401. In the dashboard, **Edge Functions, compose, Logs** shows each call, and
**Table Editor, compositions** shows the record.

### The `delete-account` function

The account page's **Delete account and data** button asks this function to delete the signed-in founder. It checks the founder's token with
Supabase Auth, then deletes that user through the admin API with the function's service role key. Every table references `auth.users` with
`on delete cascade`, so their profile, projects, documents and request log go with the account. (There are no Storage buckets yet; when logos and
exports are stored there, the function must remove those files too.)

It needs no secret of your own: Supabase gives every Edge Function `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` by default, the same two
`compose` uses for the `compositions` table. Deploy it once, and again after any change to its source:

```
npm run deploy:delete-account
```

That builds `supabase/functions/delete-account/index.ts` (git-ignored) and deploys it. `supabase/config.toml` switches **Verify JWT** off for it,
as for `compose`, because the function checks the token itself. To deploy without the command line, run `npm run build:edge`, make a function called
`delete-account` in the dashboard, paste that file and turn **Verify JWT** off.

**Check it** only with a throwaway account, since it really deletes. Without a token it answers 401 and deletes nobody:

```
curl -s -X POST https://untyznmtxgacrkogigar.supabase.co/functions/v1/delete-account
```

## 3. The web app on Vercel

1. Push the repo to GitHub, then in Vercel choose **Add New, Project** and import it. `vercel.json` already says: Vite, `npm run build`,
   output `dist`, and every path goes to `index.html` (the app has its own routes, such as `/sign-in` and `/home`).
2. Add two **Environment Variables**, for Production and Preview: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the project URL and the
   publishable key, as in `.env`). Do **not** add the Gemini key, the secret key, or the connection string: the app does not need them and
   anything starting with `VITE_` is public.
3. Deploy. The deployed app asks the `compose` function by itself; nothing else needs setting.

## 4. Tell Supabase where the app lives

In **Authentication, URL Configuration**, set the **Site URL** to the Vercel address (such as `https://droplet.vercel.app`) and add it, with `/**`
after it, to **Redirect URLs** (keep `http://localhost:5173/**` for development). Add the Preview address pattern too if you test branch
deployments (`https://*-your-team.vercel.app/**`). The link in a confirmation email and the return from Google both go to `/home` on these
addresses, so without this a founder is sent back to the wrong place.

## Working on the function from your own machine

Nothing needs deploying to work on the app: in development the app asks the dev server's own `/api/compose`, which reads `GEMINI_API_KEY` from
`.env`. To try the deployed function from the dev server, put its address in `.env` as `VITE_COMPOSE_URL` (see `.env.example`) and restart
`npm run dev`; you must be signed in.

## Files attached to a message

A founder can attach up to three files (pictures, PDFs, text files) to a message, which the `compose` function sends to Gemini. The request body limit of the function is now 12 MB, so redeploy it (`npm run deploy:compose`) before using attachments on the live site. No migration is needed, and the files are never stored. If the deployed function refuses a large PDF, lower `MAX_PDF_BYTES` and `MAX_TOTAL_BYTES` in `src/compose/attachments.ts`.

## Using DeepSeek instead of Gemini (temporary)

`AI_PROVIDER=deepseek` with `DEEPSEEK_API_KEY` (and optionally `DEEPSEEK_MODEL`, default `deepseek-chat`) makes DeepSeek answer every message, in the dev server (`.env`) and in the deployed function (as secrets). Gemini is used again when `AI_PROVIDER` is unset or `gemini`. While it is on, there is no web search and no Advanced, and a picture or a PDF cannot be read (the model is told so and says so; a text file still works). On the deployed function:

```bash
npx supabase secrets set AI_PROVIDER=deepseek DEEPSEEK_API_KEY=your-deepseek-key
npm run deploy:compose
```

To go back: `npx supabase secrets unset AI_PROVIDER` (and redeploy is not needed, the function reads its secrets when it starts).
