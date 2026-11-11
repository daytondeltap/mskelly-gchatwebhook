# Google Chat Message Portal

A mobile-friendly, password-protected Google Chat message sender.

**Website:** GitHub Pages (static frontend)  
**Secure relay:** Vercel serverless function + Upstash Redis (not supported directly by GitHub Pages)

## Architecture

Browser at `https://daytondeltap.github.io/mskelly-gchatwebhook/` → HTTPS POST to privately configured Vercel API → Google Chat incoming webhook.

The webhook URL, shared password, and Redis token must exist **only** in server-side Vercel environment variables. GitHub Pages cannot securely store them or run an API. The client configuration `config.js` contains ONLY the public API origin, never a secret.

## 1. Enable GitHub Pages

Open this repository's **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. The `.github/workflows/pages.yml` workflow publishes only `index.html`, `config.js`, and `.nojekyll`. If a workflow run happened before Pages was enabled, use **Actions → Deploy GitHub Pages → Run workflow**.

Expected public URL (after successful deployment):

https://daytondeltap.github.io/mskelly-gchatwebhook/

## 2. Configure the secure API

1. Create a Google Chat incoming webhook for the target Chat space (Space → Apps & integrations → Webhooks). Google Workspace admins may restrict this capability.
2. Create an Upstash Redis database, and get its REST URL and standard REST token.
3. Import this GitHub repository into Vercel as a project. Use **Other** framework (no build command). The backend lives in `api/send.js`.
4. Set the following server-side Vercel environment variables:

| Name | Value |
| --- | --- |
| `GOOGLE_CHAT_WEBHOOK_URL` | Full Google Chat incoming webhook URL, including its `key` and `token` |
| `SEND_PASSWORD` | A randomly generated strong shared access password (at least 12 characters; 16+ recommended) |
| `UPSTASH_REDIS_REST_URL` | Upstash HTTPS REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash standard REST token |
| `PUBLIC_ORIGIN` | `https://daytondeltap.github.io` (the **origin**, not the repository subpath) |

Deploy/redeploy the Vercel project. The API will reject any website origin other than `PUBLIC_ORIGIN`.

## 3. Connect GitHub Pages to the API

Edit the public `config.js` file to contain the **HTTPS origin** of your deployed API:

```js
window.GCHAT_API_BASE = "https://your-vercel-project.vercel.app";
```

Do not append `/api/send`; the page does that automatically.

Commit `config.js` and allow the GitHub Pages workflow to redeploy.

## 4. Test it

Open the GitHub Pages URL, type the private access password, write a test message, check the confirmation, and verify it arrived in the Google Chat space. The site never stores the password in local storage. Check the Chat space before retrying if a timeout makes delivery uncertain.

## Safety notes

- **Never paste a real Google Chat webhook into `config.js`, HTML, or any GitHub file.** Never put secrets in `VITE_*` or `NEXT_PUBLIC_*` environment variables.
- Anyone who knows the shared password can send messages. This is appropriate for a small trusted group; individual sign-in, auditing and moderation would be better for a public school-wide portal.
- The API validates the Origin header, requires JSON, limits messages to 2000 characters, limits attempts per IP, limits sends per IP and per Chat space, and fails closed if Redis is unavailable. CORS allows only the configured GitHub Pages origin.
- Requests may be limited for users who share a school/office public IP address.
- Google Chat incoming webhooks post messages only; they do not read replies.
- A GitHub Pages site can be public, but the API will not send until configured and the correct access password is supplied.

## Local development

Use `npx vercel dev` with server-side secrets configured in your local environment, with `PUBLIC_ORIGIN=http://localhost:3000` for local tests. Don't commit `.env` or `.env.local`.

## References

- [Google Chat webhooks documentation](https://developers.google.com/workspace/chat/quickstart/webhooks)
- [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
