# Reviewhere

Turns a PDF or slide deck into a quiz you can sit — multiple choice interleaved
with written identification questions, scored, explained, and linked back to the
page each question came from.

Built for a handful of students. Free, single tier, no billing.

- **Product spec:** [reviewhere-spec.md](reviewhere-spec.md) — the source of truth
- **Working notes for contributors:** [CLAUDE.md](CLAUDE.md)

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # then fill it in, see below
npm run dev                        # http://localhost:3000
```

Until `.env.local` has real Firebase values the app renders a setup notice
instead of crashing, so the shell stays browsable before a project exists.

```bash
npm test           # vitest, single run
npm run test:rules # security rules against the Firestore emulator (needs Java)
npm run lint
npm run build      # also runs the TypeScript check
```

## Environment

Every value comes from `.env.local` locally, and from your host's environment
settings in production. `.env.local` is gitignored, so **deploying does not carry
it with you** — the variables have to be set on the host as well.

| Variable | Required | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | Firebase web config — Project settings → General → Your apps |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | ” |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | ” |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | yes | ” |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | yes | ” |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | yes | ” |
| `FIREBASE_SERVICE_ACCOUNT` | yes | Service-account JSON, one line or base64. Project settings → Service accounts → Generate new private key |
| `OPENROUTER_API_KEY` | for Mode A | Free-tier key from <https://openrouter.ai/keys>. Without it the app leads with the copy-paste prompt instead |
| `OPENROUTER_MODEL` | no | Overrides the head of the free-model chain when availability shifts |
| `NEXT_PUBLIC_ENABLE_APPLE_SIGNIN` | no | `"true"` once the Apple provider is configured (needs a paid Apple Developer account) |

Two things that catch people out:

- **`NEXT_PUBLIC_*` values are inlined at build time**, not read at runtime.
  Changing one means a fresh build, not a restart.
- **`FIREBASE_SERVICE_ACCOUNT` is multi-line JSON**, and the private key's
  newlines are what usually break when pasted into a web form. The admin loader
  accepts base64, which sidesteps it: `base64 -i service-account.json`.

## Deploying

The app is a normal Next.js server. It needs a host that runs a **persistent Node
process** rather than serverless functions, because uploads are up to 25 MB and
serverless platforms cap request bodies well below that — Vercel's limit is
4.5 MB, which this app cannot live inside without moving extraction into the
browser.

### Render

[`render.yaml`](render.yaml) defines the service, so importing this repo as a
Blueprint is the whole setup. Then:

1. **Set the environment variables** from the table above in the Render
   dashboard. They are marked `sync: false` in the blueprint precisely so no
   secret lives in the repo.
2. **Authorise the domain in Firebase.** Console → Authentication → Settings →
   Authorized domains → add `your-service.onrender.com` and any custom domain.
   Skip this and Google sign-in fails with `auth/unauthorized-domain`.
3. **Deploy the Firestore rules and indexes** if they aren't current:
   `firebase deploy --only firestore`. A newly created index takes a minute or
   two to build, and queries against it fail until it does.

#### Choosing an instance

The blueprint ships `plan: free` so nothing is billed without a decision, but
free has two properties worth knowing before you rely on it:

- It **spins down after 15 minutes idle** and takes about a minute to wake, so
  the first sign-in after a quiet spell is slow.
- Its memory is tight. Parsing a 20 MB PDF holds the file and its parsed
  structure in RAM at once, so a large upload can be an out-of-memory kill
  rather than a clean error.

If you upload large documents, test a real one on the instance you intend to run
before trusting it, and size up if it falls over.

### Anywhere else

Any host that runs `npm run build` then `npm start` and gives the process a
`$PORT` will work — Railway, Fly, or Firebase App Hosting, which has the
incidental advantage of living in the same project as Firestore and Auth.

## How it fits together

- `src/app/(auth)/` — signed-out routes; `src/app/(app)/` — the shell and every
  signed-in route
- `src/lib/extraction/` — PDF and PPTX text extraction, tested against real file
  bytes rather than mocks
- `src/lib/generation/` — both question-generation modes behind one validator
- `src/lib/quiz/` — answer matching, scoring, and the in-progress session
- `firestore.rules` — the actual security boundary, covered by `npm run test:rules`

Storage is deliberately unused: the ingest route extracts text and discards the
original file, so there is no document preview and no re-extraction. See the
"Storage" section of [CLAUDE.md](CLAUDE.md) before adding anything that depends
on the uploaded file still existing.
