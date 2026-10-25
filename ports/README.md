# Ports

Deployment targets other than the shipped AWS stack. **There are no ports yet.** The AWS deployment lives in `infra/`, `lambda/` and `scripts/`, and is described in [docs/SELF-HOSTING.md](../docs/SELF-HOSTING.md).

To add one, read [docs/PORTING.md](../docs/PORTING.md), open an issue titled `Port: <provider>`, then copy [`_template/`](_template/README.md) to `ports/<provider>/`.

| Provider | Status | Identity | Store | Last tested | Maintainer |
|---|---|---|---|---|---|
| (none yet) | | | | | |

Status values: `experimental` (works for its author), `maintained` (the listed maintainer re-tests it), `unmaintained` (known to be stale).
