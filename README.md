# Google Chat Message Portal

A clean, password-protected website for sending one-way plain-text messages to a Google Chat space through an incoming webhook. Designed for deployment on **Vercel**.

## What it does

- Mobile-friendly, accessible message composer with clear confirmations and character count.
- Server-only Google Chat webhook secret (never shipped to the browser).
- Shared password required for sending; it is not saved in browser storage.
- Atomic Upstash Redis rate limits (15 attempts per IP per 15 minutes, 10 sends per IP per minute, maximum one message per space per second).
- Strict request size, method, Origin, content type, message length, and webhook destination checks. Rate limiting fails closed.

## Deploy

1. In Google Chat on desktop, open the target **space → Apps & integrations → Add webhooks** and copy the incoming webhook URL. Your Workspace admin may need to allow webhooks.
2. Create an Upstash Redis database and copy its HTTPS REST URL and **standard** REST token.
3. Import this GitHub repository as a **Vercel** project using the **Other** framework preset. No build command is needed.
4. In the Vercel project's **Environment Variables**, set the following values (for Production and whichever Preview environments you intend to use):

| Variable | Value |
| --- | --- |
| `GOOGLE_CHAT_WEBHOOK_URL` | Full incoming webhook URL starting with `https://chat.googleapis.com/v1/spaces/` |
| `SEND_PASSWORD` | A unique, strong, randomly generated access password of 16+ characters (minimum 12) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis HTTPS REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis **standard** REST token |
| `PUBLIC_ORIGIN` | Recommended: exact deployment origin, e.g. `https://your-app.vercel.app` (no trailing slash) |

5. Redeploy after setting the environment variables. Open the site, enter the shared password, type a test message, check the acknowledgement, and verify its arrival in the Google Chat space.

**Never** commit an actual webhook URL, password, or Redis token to Git. Do not use a `VITE_*`, `NEXT_PUBLIC_*`, or other frontend-exposed variable for any secret.

## Important boundaries

- The person using this website must know the access password. Share it privately with authorized senders.
- Messages are one-way. Incoming webhooks **cannot read Google Chat conversations**.
- Anyone with the shared password can submit messages. To require named accounts, audit trails, or per-user access revocation, add real authentication rather than using a shared password.
- This is not an anonymous public message board. If you want anonymous contributions, use separate anti-abuse checks and moderation rather than removing the access control.
- Rate limits are based on client IP via Vercel's forwarded IP header; users behind a shared school/office network may share a limit.
- Google Chat can throttle or reject messages independently of the website.
- A network error or timeout can make delivery uncertain. Check the Chat space before retrying to avoid duplicates.

## Local development

Use `npx vercel dev` with the environment variables configured locally. For HTTP localhost development, set `PUBLIC_ORIGIN=http://localhost:3000` (or whichever local port the Vercel CLI serves). Do not commit `.env` or `.env.local`.

## References

- [Google Chat incoming webhook guide](https://developers.google.com/workspace/chat/quickstart/webhooks)
- [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi)
