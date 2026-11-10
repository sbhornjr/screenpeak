# Mobile sign-up

Sign up asks for an email, a username, and a password. When email confirmation is on, the screen says "Check your email to confirm the account, then log in." The phone does not attach a PKCE code challenge to that request, so the confirmation link does not need a verifier stored on the phone. Until the link is opened, Log in says "Email not confirmed". After the link, the same password signs in. This drive checks that on Expo web against the local auth stand-in. It does not send email, and it does not change peek's password.

## Sub-features

- `request` shows Sign up, Email, Username, Password, and Back.
- `confirmation` shows the check-your-email sentence and records a signup with no code challenge.
- `unconfirmed` rejects the password before the confirmation link.
- `confirmed-sign-in` accepts the password after the link and leaves the welcome.

## How to get to it (user POV)

- Open `http://localhost:8081/sign-up` while signed out.
- The welcome's Sign up button and Log in's Create an account link open the same screen.

## Driving it with verify-screenpeak

Preconditions:

- `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor` exits 0.
- The website API is `http://127.0.0.1:3210`. The database is local `screenpeak_verify_copy`. The auth stand-in is `http://127.0.0.1:54321`.
- Port 8081 is free. The drive starts Expo web at `http://localhost:8081` and stops it before it exits. Do not run it at the same time as `drive mobile-nav` or `drive mobile-forgot-password`.
- You start signed out. The drive deletes `signupfan` (`hornflakes+signup@mail.grokbot.com`) before it exits, including after a failure. peek's password stays `peekpeek`.

- **Open Sign up.** The drive opens `http://localhost:8081/sign-up`. The screen says Sign up and shows Email, Username, Password, and Back.
- **Create the account.** Fill Email with `hornflakes+signup@mail.grokbot.com`, Username with `signupfan`, and Password with `local-signup-1`. Click Sign up. The screen says "Check your email to confirm the account, then log in."
- **Reject the password before confirmation.** Open Log in and sign in with that email and password. The screen says "Email not confirmed".
- **Open the local confirmation link.** The drive calls the gateway's `/auth/v1/verify` with the token it recorded. That is the first hop of the default confirmation email. It returns 200 and does not ask for a code verifier.
- **Sign in.** Click Log in again. The feed no longer shows the welcome. It says "Your feed is quiet."
- **Proof.** The drive writes `/tmp/screenpeak-verify/evidence/mobile-sign-up/`. The png files are the sign-up form, the check-your-email sentence, the unconfirmed error, and the signed-in feed. `result.json` records that the signup request's code challenge was null, that verify returned 200, and that sign-in then reached the feed.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-sign-up
```

## Gotchas

- The local gateway does not send email. The drive calls `/auth/v1/verify?token=…&type=signup` itself. A hosted Supabase project is not used.
- A signup that includes `code_challenge` is the bug this drive locks: verify then returns 400, and `result.json` has `signupChallenge` set. The phone client must leave sign-up on the default implicit flow.
- Password reset is a separate PKCE request. This drive does not open Forgot password?.
- The drive deletes `signupfan` before it exits. `down` drops the database. Do not point this drive at a hosted database.
