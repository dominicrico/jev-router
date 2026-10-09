# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub's "Report a vulnerability" button on the
[Security tab](https://github.com/dominicrico/jev-router/security/advisories/new), not in a public issue.
I aim to reply within a week.

## What the plugin sends and stores

- It sends your prompt (up to `maxTaskChars`), optionally recent messages, and subagent task text to
  `api.typesafe.ai`. Keys, tokens, private key blocks, `password=` style values and URL credentials are
  redacted first. Pattern redaction is not a guarantee; set `sendHistory` to false for sensitive sessions.
- Your TypeSafe API key is read from the plugin option, the plugin store (`/jev key`) or `TYPESAFE_API_KEY`.
  The store is plain text; prefer the environment variable.
- The plugin makes no other network calls and writes no files outside the Claude Code plugin store.

## Supported versions

The latest release.
