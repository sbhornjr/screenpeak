# Mobile forgot password

Log in has a Forgot password? link. That screen asks for an email and shows "If that email has an account, a reset link is on its way." The sentence is the same when the address has no account. A second send inside 30 seconds does not fire another request, and the button stays disabled. The reset link opens the app at `/auth/confirm?next=/auth/update-password` — `screenpeak://auth/confirm` on a dev or production build, and the Expo web origin of that path. Confirm exchanges the code for a recovery session and opens set-new-password. Without that session the screen does not accept a password. Signed-out tabs stay on the welcome. This drive checks the flow on Expo web against the local auth stand-in. It does not open a device, and it does not change peek's password.

## Sub-features

- `request` shows Reset password, an email field, Send reset link, and Back.
- `confirmation` shows the same sentence for an address that exists and one that does not, and disables Send reset link.
- `recovery-link` opens set-new-password from the local reset link and saves a new password.
- `sign-in-with-new-password` rejects the old password and signs in with the new one.
- `no-session` tells you the set-new-password screen only works from the reset link.

## How to get to it (user POV)

- Open the Expo web app at `http://localhost:8081/` while signed out. The welcome is showing. Nothing sends you to a sign-in wall.
- Open `http://localhost:8081/sign-in` and click Forgot password?.
- Open `http://localhost:8081/auth/update-password` with no recovery session.
- After a reset email, open the link. On Expo web that is `http://localhost:8081/auth/confirm?next=/auth/update-password&code=…`. On a build it is `screenpeak://auth/confirm?next=/auth/update-password&code=…`.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`. The auth stand-in is `http://127.0.0.1:54321`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. `down` also stops a leftover Expo process. `--host localhost` listens on localhost, which is not `127.0.0.1` on this machine.
- You start signed out. The drive inserts `resetfan` (`hornflakes+reset@mail.grokbot.com`) with password `local-old-1` and deletes that user before it exits, including after a failure. peek's password stays `peekpeek`.

- **Open the app signed out.** The drive opens `http://localhost:8081/`. The screen says Welcome and "Sign up, log in, or browse the catalogue."
- **Open set-new-password with no link.** Open `http://localhost:8081/auth/update-password`. The screen says "This page only works from the reset link in your email." and shows Request a new link and Back.
- **Open the request from Log in, then Back.** Open `http://localhost:8081/sign-in`, click Forgot password?, then Back. Log in is showing again. Click Forgot password? again. The screen says Reset password and Send reset link.
- **Request a reset.** Fill Email with `hornflakes+reset@mail.grokbot.com` and click Send reset link. The screen says "If that email has an account, a reset link is on its way." Send reset link is disabled. A second click does not record a second code.
- **Open the local reset link.** The drive reads the code the local gateway stored for that request and opens `http://localhost:8081/auth/confirm?next=/auth/update-password&code=…`. The screen says Set a new password.
- **Save a new password.** Fill New password and Confirm new password with `local-new-1` and click Update password. The screen says "Password updated. Taking you home…".
- **Reject the old password.** The drive clears the recovery session, opens Log in, and signs in with `local-old-1`. The screen says "Invalid login credentials".
- **Sign in with the new password.** Sign in with `local-new-1`. The feed no longer shows the welcome. It says "Nothing in your feed yet."
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-forgot-password/`. The png files are the welcome, the blocked set-new-password screen, the request, the confirmation, the set-new-password form, the saved-password sentence, and the signed-in feed. `result.json` records that the gateway's recover response was the same for `resetfan` and for `nobody-reset@example.com`, that the redirect was the Expo web confirm URL, and that `verify_local.passwords` stored `local-new-1`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-forgot-password
```

## Gotchas

- The local gateway does not send email. The drive opens the redirect URL it recorded, with the one-time code appended. That is the same URL Supabase would redirect to after the message. A hosted Supabase project is not used.
- The code verifier stays in Expo web `localStorage` from the request. The confirm page has to load in that same browser. A new browser has no verifier, and the exchange fails.
- `POST /auth/v1/recover` returns `{}` with status 200 for an address that exists and one that does not. The UI must not replace that with a "not found" sentence.
- Send reset link stays disabled for 30 seconds after the confirmation. The drive does not wait that out.
- Opening `/auth/update-password` without a recovery session must not show the password fields.
- The native redirect string is `screenpeak://auth/confirm?next=/auth/update-password`. This drive runs on Expo web, so it does not open the custom scheme. Supabase's redirect allowlist needs `screenpeak://auth/confirm**` and `http://localhost:8081/auth/confirm**` before a hosted project will send the link. A single `*` does not match `next`, because that value contains `/`.
- The drive deletes `resetfan` before it exits. `down` drops the database. Do not point this drive at a hosted database.
