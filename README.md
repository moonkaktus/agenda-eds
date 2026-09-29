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
flake.nix              `eds-python` wrapper + dev shell (NixOS)
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

Preferences live under `providers.calendar-eds.preferences` in
`~/.config/vicinae/settings.json`.

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
