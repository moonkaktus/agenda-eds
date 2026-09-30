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
flake.nix              extension package + dev shell (NixOS)
```

## Requirements

- vicinae ≥ 0.29 with the extension host
- Evolution Data Server running, with at least one enabled calendar
- A Python that can `import gi` and load `EDataServer`/`ECal` typelibs

On NixOS, provide that interpreter yourself — the `eds-python` wrapper in the
home-manager snippet below builds one against the system
`evolution-data-server`, so it shares the running EDS instead of pulling a
second copy. `nix develop` only supplies nodejs for building/testing; test the
helper with the host interpreter:

```sh
eds-python assets/eds-helper.py --days 1
```

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

Add this repo as a flake input and install it through the home-manager
`programs.vicinae` module:

```nix
# flake.nix
agenda-eds = {
  url = "github:moonkaktus/agenda-eds";
  inputs.nixpkgs.follows = "nixpkgs";
};

# home.nix
{ inputs, pkgs, ... }:
let
  agenda = inputs.agenda-eds.packages.${pkgs.stdenv.hostPlatform.system};
  # Python + GI typelibs for the EDS helper, built from the system pkgs so it
  # reuses the running evolution-data-server.
  eds-python = pkgs.writeShellScriptBin "eds-python" ''
    export GI_TYPELIB_PATH="${
      pkgs.lib.makeSearchPath "lib/girepository-1.0" (with pkgs; [
        evolution-data-server libical libsoup_3 json-glib
        gnome-online-accounts gcr_4 libsecret gobject-introspection
      ])
    }''${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
    exec ${pkgs.python3.withPackages (ps: [ ps.pygobject3 ])}/bin/python3 "$@"
  '';
in {
  home.packages = [ eds-python ]; # makes `eds-python` resolve on PATH
  programs.vicinae = {
    enable = true;
    extensions = [ agenda.default ]; # -> ~/.local/share/vicinae/extensions/calendar-eds
  };
}
```

The extension's `python` preference defaults to `eds-python`, so with the
wrapper on PATH nothing else is needed. Do **not** set
`programs.vicinae.settings` just for this: upstream home-manager writes that
option straight to `~/.config/vicinae/settings.json`, replacing any
GUI-managed settings. (The vicinae flake's own home-manager module merges via
`nix.json` instead, but it overrides the upstream module and is a bigger
change.) If you do want Nix to own `settings.json`, put your full config there.

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
| `python`        | Interpreter used for the helper (default `eds-python`)    |

A locally installed extension is namespaced by its author, so preferences live
under `providers."@moonkaktus/calendar-eds".preferences` in
`~/.config/vicinae/settings.json` (or `nix.json` when managed by home-manager).

## Behaviour

- The helper expands recurrences via EDS (`generate_instances`), so recurring
  events appear per occurrence.
- Occurrences are grouped by local day; all-day events sort first. The agenda
  opens with the detail pane visible: event name and time first, description
  below, links last. Times are 24-hour and each list row shows the full
  start–end range. Past events are dimmed (muted icon/time); the in-progress
  timed event is highlighted in green with a `Now` tag. The default action
  opens the event link (URL property, or the first URL found in the
  location/description).

  Note: vicinae's `List.Item` only accepts a plain string `title`, so a past
  event's title cannot itself be recoloured — the dimming is carried by the
  icon and time accessory.
- Notifications are sent for timed, non-cancelled events within `notifyLead`
  minutes of their start. Each occurrence is deduplicated by `uid:startMs`
  (persisted in encrypted `LocalStorage`) and dedup keys older than two days
  are pruned.
- If EDS or the helper fails, the helper prints `[]`, the agenda shows its
  empty state, and the last cached events are reused.
