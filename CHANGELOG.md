# Changelog

What changed in each ARI release. `./ari update` links here when it offers a release.

Releases are tags named `X.Y.Z` on `main`. Earlier releases are described by their commits: https://github.com/ARIsoftware/ARI/tags

## Unreleased

### Updating

- The update command and the installer's download step now run under automated tests against real git repositories. The update logic moved out of `.ari/cli.js` into `scripts/lib/updater.js`.
- `./ari update` shows a "What's new" link when the release it offers has a changelog.
- When it refuses a named older release on a copy that uses its own version numbers, it now says that `./ari update` without a version is the command to use.
- With nobody at the keyboard, ssh is also kept from waiting on a passphrase or host-key question. Your own ssh setup (`GIT_SSH_COMMAND`, `GIT_SSH`, or `core.sshCommand`) is left as it is.
- A Git Bash window on Windows is recognised as an interactive terminal, so git can ask for credentials there.
- The startup check for a newer release does less work before `./ari start` carries on.
- A list of conflicting files that is cut off at 20 says how many more there are.

### Installing

- The installer no longer reports "Installation Complete!" when ARI was not downloaded or its dependencies were not installed. It says what is missing and exits with a failure code.
- With a named version, a path that is a file, or a folder that cannot be read, gets a clear message instead of a raw error.
- A named version that cannot be downloaded no longer blames the network; git's own message is shown.
- The remote is named `upstream` when ARI is cloned, instead of being renamed afterwards. This also works when git is configured with a different default remote name.

### Interface

- The version number is shown at the bottom of the sidebar on module submenus too, not only on the main menu.

### Project

- A pushed tag is checked by CI: it must be an annotated `X.Y.Z` tag on `main`, match `package.json`, and have an entry in this file.
- Command prompts are also kept in `.codex/prompts/`.
- `@redocly/cli` updated to 1.34.20 (GHSA-657c-g7qc-r9j2, development only).

## 2.0.10

- `/ari-update` no longer tells anyone to run SQL by hand. ARI applies its schema itself: `lib/db/setup.sql` on every start, and an enabled module's `schema.sql` when it changes. The prompt also says never to run a module's `uninstall.sql`, which removes that module's tables.

## 2.0.9

Fixes to the release-based updater from 2.0.8.

- At "Merge these updates?", only `y`, `yes`, or Enter on a default-yes prompt is a yes. Typing `no` used to go ahead with the update.
- A named release older than the installed one is always refused, before anything is downloaded.
- When the installed version and git history disagree, or the installed version cannot be read, the update needs a typed `yes`.
- `./ari update` runs git with your own configuration and shows git's errors, so private mirrors can authenticate.
- The update stops up front on a shallow clone, on a copy that shares no history with the release, and on conflicts left by an earlier git operation.
- Only the missing release is downloaded. `--edge` fetches only `main`.
- The startup notice asks the same `upstream` remote that `./ari update` uses.
- Installer: an unknown `ARI_VERSION` stops the install before anything is cloned, and a named release always goes into a folder of its own.
- `/ari-update` asks which release to move to when more than one is newer.

## 2.0.8

- `./ari update` moves to the latest release instead of the tip of `main`.
- `./ari update <version>` moves to a specific newer release. Downgrades are refused.
- `./ari update --edge` keeps the earlier behaviour of following `main`.
- `./ari start` says which release is available: "ARI 2.0.9 available (you have 2.0.8)".
- New installs land on the latest release. `ARI_VERSION=<version>` or `ARI_VERSION=edge` chooses otherwise.
