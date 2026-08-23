This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

**Note:** `npm run dev`'s `DATABASE_URL` (from `.env`) is the same database used in production — there is no separate cloud staging environment. For anything that writes data or touches the schema, use the local staging database below instead.

## Tests

```bash
npm test          # run once
npm run test:watch
```

Covers the core scoring logic (`src/lib/review.ts`), shift/date math (`src/lib/shifts.ts`), and the fleet-status logic in `src/app/dashboard/inspectionRow.ts` — including a regression test for a real bug where a vehicle's status came from only its most recent inspection, letting an unconfirmed safety flag get silently cleared by a later "all good" shift.

## Local staging database

A real, persistent Postgres database (via `prisma dev`) that is **not** the shared dev/production database — use it for anything risky: schema changes, data migrations, or testing under realistic data volume.

```bash
npm run db:staging          # start it (safe to re-run; a no-op if already running)
npm run db:staging:migrate  # apply the current schema
npm run db:staging:seed     # fill it with ~a month of realistic synthetic inspections
npm run dev:staging         # run the app against it instead of the real database
```

Connection details live in `.env.staging` (gitignored, machine-specific). If the named server is ever removed and recreated, its port may change — run `npx prisma dev ls` and update the `DATABASE_URL` in `.env.staging` to match.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
