# Calendar (EDS) — vicinae extension

Agenda view and upcoming-event desktop notifications for
[vicinae](https://vicinae.com), backed by Evolution Data Server.

EDS owns the Exchange/EWS account and its credentials, so this extension never
touches authentication: a small Python helper asks the running EDS for
calendar occurrences and hands them to the extension as JSON.

## Layout

```
src/agenda.tsx         view command: grouped list of upcoming events
src/notify-events.ts   no-view command, runs every minute, sends notifications
src/lib/eds.ts         spawns the helper, parses JSON, caches on disk
src/lib/events.ts      pure filtering/grouping/time helpers (unit-tested)
assets/eds-helper.py   EDS query, prints one JSON array
test/                  node --test suite for src/lib/events.ts
flake.nix              extension package, `eds-python` wrapper, dev shell (NixOS)
```

## Requirements

- vicinae ≥ 0.29 with the extension host
- Evolution Data Server running, with at least one enabled calendar
- A Python that can `import gi` and load `EDataServer`/`ECal` typelibs

On NixOS, get that interpreter from the flake:

```sh
nix build .#eds-python --print-out-paths
# -> /nix/store/...-eds-python/bin/eds-python
```

or enter the dev shell (`nix develop`) which has the typelibs wired up.

## Distribution

There are two ways to ship this extension.

### Vicinae store (public)

`vici publish` to the [vicinae extensions repo](https://github.com/vicinaehq/extensions).
Other people then install it from the store UI. Not the right fit for a
personal extension.

### Nix flake + home-manager (personal)

The flake exposes:

- `packages.<system>.default` — the extension bundle, built with
  `vicinae.lib.mkVicinaeExtension`
- `packages.<system>.eds-python` — a `python3` that can import EDS

Add this repo as a flake input and install it through the vicinae
home-manager module:

```nix
# flake.nix
inputs.agenda-eds.url = "github:moonkaktus/agenda-eds";

# home.nix
{ inputs, pkgs, ... }:
let
  agenda = inputs.agenda-eds.packages.${pkgs.stdenv.hostPlatform.system};
in {
  programs.vicinae = {
    enable = true;
    extensions = [ agenda.default ];
    settings.providers."@moonkaktus/calendar-eds".preferences.python =
      "${agenda.eds-python}/bin/eds-python";
  };
}
```

That symlinks the bundle into `~/.local/share/vicinae/extensions/calendar-eds`
and writes the interpreter preference to `~/.config/vicinae/nix.json` (which
takes precedence over `settings.json`).

Two things to keep in mind:

- The extension ID is the **directory name**, not `package.json`'s `name`
  (`ExtensionManifest::fromPackageJson` uses the last path component), and the
  preferences key is `@{author}/{id}`. That is why `flake.nix` pins the
  derivation `name = "calendar-eds"` even though the version is `0.1.0`; a
  `calendar-eds-0.1.0` folder would produce a `@moonkaktus/calendar-eds-0.1.0`
  key and stop matching the preference below.
- The imperative `npm run build` install writes to the same path, so remove
  `~/.local/share/vicinae/extensions/calendar-eds` before letting home-manager
  own it.

## Build / develop

```sh
npm install
npm run build     # vici build, installs into ~/.local/share/vicinae/extensions/calendar-eds
npm run dev       # vici develop (hot reload)
npm test          # unit tests for the pure helpers
```

## Preferences

| Preference      | Meaning                                                   |
| --------------- | --------------------------------------------------------- |
| `lookaheadDays` | How many days the agenda and notifications cover          |
| `pollInterval`  | Minimum minutes between EDS queries (cache TTL)           |
| `notifyLead`    | Minutes before an event to notify                         |
| `python`        | Interpreter used for the helper; point it at `eds-python` |

A locally installed extension is namespaced by its author, so preferences live
under `providers."@moonkaktus/calendar-eds".preferences` in
`~/.config/vicinae/settings.json` (or `nix.json` when managed by home-manager).

## Behaviour

- The helper expands recurrences via EDS (`generate_instances`), so recurring
  events appear per occurrence.
- Occurrences are grouped by local day; all-day events sort first. The agenda
  opens with the detail pane visible: event name and time first, description
  below, links last. Times are 24-hour. The default action opens the event link
  (URL property, or the first URL found in the location/description).
- Notifications are sent for timed, non-cancelled events within `notifyLead`
  minutes of their start. Each occurrence is deduplicated by `uid:startMs`
  (persisted in encrypted `LocalStorage`) and dedup keys older than two days
  are pruned.
- If EDS or the helper fails, the helper prints `[]`, the agenda shows its
  empty state, and the last cached events are reused.
