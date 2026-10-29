# Contributing

**How this project is run.** Strength is a solo project, maintained by one person and shared so that others can read it, fork it, self-host it and port it to other platforms. Commits to `main` go in directly and there is no required review; that is a deliberate choice for a one-person repository, not an oversight.

- **Issues are welcome**: bugs, unclear docs, and questions about running your own copy. Search first, and keep workout data and credentials out of anything you post.
- **Pull requests: fixes, docs and ports are welcome.** Open an issue first for anything larger than a typo, so the scope can be agreed before you spend time.
- **Not accepted upstream:** changes to the product itself (the training program, the progression rules, the Pacific time zone, the single-user model) and anything that weakens the security model. Those belong in your fork. You never need permission to fork and change it.
- **Security problems** go to [SECURITY.md](SECURITY.md), not to a public issue.
- Replies are best effort and may take a while.

## Running the tests

Requires Node.js 22 (see `.nvmrc`). There is nothing to install: the root has no dependencies and the tests use Node's built-in runner.

```sh
node --test
```

Tests are offline and deterministic. They never call AWS, and `lambda/events` tests use an in-memory store (`test-support/fake-s3.mjs`). A few cases need a browser (the real IndexedDB adapter) and are described in [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) section 6.

To try the app, serve `app/` (`python3 -m http.server 4173 --directory app`); with the empty `app/js/config.js` it runs in local-only mode with no account.

## Changing the code

- Match the surrounding code. There is no linter or formatter on purpose (zero dependencies); [`.editorconfig`](.editorconfig) sets indentation and line endings.
- New behaviour comes with a test in `test/`, written the way the neighbouring ones are. Pure logic stays pure: `test/engine-purity.test.mjs`, `test/logging-purity.test.mjs` and `test/boot-imports.test.mjs` guard the layering and fail if network code leaks into local-only mode.
- Behaviour is specified in [docs/SPEC-strength.md](docs/SPEC-strength.md), which has a versioned changelog. A change in behaviour updates the spec in the same pull request.
- Dated findings, evaluations, plans and results are recorded as new entries in [journal/](journal/README.md), one per unit of work and never edited afterwards. The journal is a log, not a spec: durable behaviour goes in the spec above.
- Per-deployment settings never go in the repository. They live in the git-ignored `private/` folder, and `app/js/config.js` stays empty in git (a test enforces it).
- Third-party media does not go in the repository. Read [docs/MEDIA-RIGHTS-AUDIT.md](docs/MEDIA-RIGHTS-AUDIT.md) before adding any image.
- Commit messages: a short summary line, then what and why.

## Adding a deployment target (a "port")

Running Strength on Vercel, Cloudflare or another platform is a supported kind of contribution. Start with [docs/PORTING.md](docs/PORTING.md): it lists the interfaces to implement, what stays the same, a checklist, and the layout (`ports/<provider>/`, from the [template](ports/_template/README.md)). The wire contract is in [docs/API-CONTRACT.md](docs/API-CONTRACT.md). A port needs its own README, passes `node --test` and the storage contract suite, and is labelled community-maintained.

## Releases

Releases are tagged `vMAJOR.MINOR.PATCH` with short human-written notes on the GitHub releases page. Release versions are separate from the spec versions in the spec's changelog (v1.x) and from the early app versions in spec section 0.
