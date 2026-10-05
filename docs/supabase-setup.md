# Setting up Supabase for Droplet

Droplet runs without Supabase (on this device alone, with no sign-in). With it, each founder signs in and their projects and documents are kept
in the database, private to them. These steps are done once, in the Supabase dashboard.

## 1. Keys

In the project, open **Project Settings**, then **API Keys** (or the **Connect** button). Put the project URL and the **publishable** key (older
projects call it the **anon** key) in `.env` or `.env.local`, which are git-ignored:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Restart `npm run dev` after changing them. Never put the secret (service role) key, or the database connection string, in the app or in any
`VITE_` variable.

## 2. The database

Open **SQL Editor**, make a new query, paste the whole of `supabase/migrations/20261005000000_init.sql`, and run it. It makes `profiles`,
`projects` and `project_documents`, turns row-level security on for all three, and shuts the signed-out role out. Later migrations in that folder are
run the same way, in order.

To check it worked, open **Table Editor**: the three tables are there, each marked with RLS enabled.

## 3. Sign-in

Open **Authentication**.

- **URL Configuration**: set **Site URL** to `http://localhost:5173`, and add `http://localhost:5173/**` to **Redirect URLs**. When the app is
  deployed, add its address to both as well. The link in a confirmation email and the return from Google both go to `/home` on these addresses.
- **Sign In / Providers, Email**: on by default. While you build, you may switch **Confirm email** off so an account works at once. Switch it back
  on before real use: with it on, the app tells the founder to open the link that was sent.
- **Sign In / Providers, Google**: switch it on and fill in the client ID and secret from Google Cloud (APIs and Services, Credentials, OAuth
  client ID, type Web application). In Google Cloud, add the **Callback URL** that Supabase shows on this page as an authorised redirect URI. Until
  Google is set up, the button on the sign-in screen says that Google is not switched on.

## 4. Check it

Run `npm run dev` and open `/home`. You are sent to the sign-in screen. Make an account, sign in, and make a change that you save: in **Table
Editor**, `project_documents` has a row for your project. Sign in as someone else and their projects are empty.

## Free plan

Free projects pause after about a week without use and have no backups. Open the dashboard before a presentation or a testing session to make sure
the project is awake, and keep every change to the schema in `supabase/migrations`.
