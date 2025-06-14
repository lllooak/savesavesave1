## Environment Variables

The application relies on a few environment variables for interacting with
Supabase and for sending emails using [Resend](https://resend.com). Ensure the
following keys are available in your deployment:

- `SUPABASE_URL` – The base URL of your Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` – Service role key used by the edge functions.
- `RESEND_API_KEY` – API key used by Supabase edge functions.
- `RESEND_FROM_EMAIL` – Address used by the server when sending emails.
- `VITE_RESEND_API_KEY` – API key exposed to the client for direct Resend calls.
- `VITE_RESEND_FROM_EMAIL` – Address used in the `from` field for client email requests.

Example `.env` configuration:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=noreply@example.com
VITE_RESEND_API_KEY=your_resend_api_key
VITE_RESEND_FROM_EMAIL=noreply@example.com
```
