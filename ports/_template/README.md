# Port: <provider>

Copy this folder to `ports/<provider>/` and replace every `<...>`. Delete this paragraph. Read [docs/PORTING.md](../../docs/PORTING.md) first.

**Status:** experimental | maintained | unmaintained
**Last tested:** <yyyy-mm-dd> on <platform and runtime versions>
**Maintainer:** <GitHub handle>

## What it deploys

- Static site: <where `app/` is served from>
- API: <function or worker that wraps `lambda/events`, and how requests reach `/events`>
- Store: <which store, and how it meets the compare-and-swap requirement>
- Identity: <Cognito kept (option A) or your own provider (option B), and how tokens are verified>

## Prerequisites

<accounts, CLI tools and versions, permissions>

## Deploy

<commands, in order, safe to re-run>

## Check it works

<the end-to-end check from docs/PORTING.md section 6: sign in, log a set, see it on a second device, a different user gets 403>

## Teardown

<commands, and what is kept or deleted, including the data store and users>

## Cost and limits

<what it costs for one user, free-tier assumptions with a date, platform limits that matter>

## Layout

```
adapter/   <entry file>
infra/     <provider configuration>
scripts/   <deploy, teardown, config injection>
tests/     <offline *.test.mjs; credentials-needed tests are *.live.mjs, not in a directory named "test">
```
