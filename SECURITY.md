# Security policy

Strength is a solo-maintained project that other people run in their own AWS accounts, so a vulnerability here can affect more than the maintainer. Please report problems privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the **Security** tab of this repository, choose **Report a vulnerability**, and describe the problem. Direct link: <https://github.com/kathishah/strength/security/advisories/new>.

- Please include what you found, where (file and line, or the route), how to reproduce it, and what an attacker gains.
- **Do not open a public issue or pull request with the details.** If the Report button is not available, open an issue that says only that you need a private channel, with no details, and a private route will be arranged.
- Expect a first reply within about seven days. This is a one-person project with no service-level promise; fixes are made on a best-effort basis and credited if you wish.

## What is covered

The code in this repository: the app (`app/`, `demo/`, `landing/`), the sync backend (`lambda/events/`), the infrastructure template (`infra/template.yaml`) and the deploy and import/export scripts (`scripts/`). Fixes go to the latest release and to `main`; older versions are not patched.

Not covered:

- **The maintainer's own private instance** at `strength.logbook.me`. It is not a service for forks. Please do not probe it; show the problem from the code or from your own deployment instead.
- Your own deployment's configuration and your AWS account. See "If you run your own copy" below.
- Third-party services and packages (AWS, Cognito, npm packages). Report those upstream; tell me if this project's use of them is what makes it exploitable.

## Documented limits that are not vulnerabilities

These are recorded decisions, with their reasons, in the docs. A report that only restates one of them will be closed with a pointer, though a way to make one of them worse is welcome.

- **The Cognito app client id and API URL are public.** They are written into `app/js/config.js` of every deployed copy and sent to every browser. They are not secrets: the app client has no secret, and the API requires a valid token.
- **Sign-in is an email and a 6-digit PIN**, Cognito's shortest possible password ([spec 6.1](docs/SPEC-strength.md)). It is weak by design for a single-user, low-value account. Cognito's own lockout throttles guessing.
- **No Content-Security-Policy**, and the refresh token is kept in `localStorage`. The app has no third-party scripts and no HTML-injection sinks; this is a recorded trade-off (the policy blocked exercise images).
- **The Lambda trusts the token's `sub`.** Verifying the token is API Gateway's job in the shipped stack ([API contract](docs/API-CONTRACT.md) section 2). A port that does not verify tokens is a port bug, so please report it to the port's maintainer.

## If you run your own copy

Your stack, bucket and user pool are yours, and so is keeping them patched.

- Watch this repository's releases, or enable Dependabot alerts on your fork, and redeploy with `scripts/deploy-stack.sh` after a security release. The Lambda's dependencies are in `lambda/events/package-lock.json`.
- Keep `private/` (your `deploy.env`, exports) out of git; it is ignored by default.
- Never commit credentials, tokens or exports. If you do, rotate them first and then clean the history.
