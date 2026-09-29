#!/usr/bin/env python3
"""Query Evolution Data Server for calendar events and print a JSON array.

Usage: eds-helper.py [--days N]

Events are occurrences in [local midnight today, local midnight + N days).
Recurrences are expanded by EDS (generate_instances), so the callers never
need to understand rrule/rdates/exdates. On any failure we print `[]` and
exit 0 so the extension degrades gracefully.
"""

import argparse
import json
import sys
from datetime import datetime, time, timedelta

import gi

gi.require_version("EDataServer", "1.2")
gi.require_version("ECal", "2.0")
# libical ships ICalGLib as 3.0 in current distros and 4.0 in some; we do not
# use the namespace directly but ECal depends on it, so make sure one loads.
for _version in ("4.0", "3.0"):
    try:
        gi.require_version("ICalGLib", _version)
        break
    except ValueError:
        continue

from gi.repository import ECal, EDataServer, ICalGLib  # noqa: E402

FALLBACK_COLOR = "#539bf5"


def local_tz():
    return datetime.now().astimezone().tzinfo


def time_to_datetime(tt):
    """Convert an ICalGLib.Time to an aware local datetime (None passes through)."""
    if tt is None:
        return None

    if tt.is_date():
        return datetime(tt.get_year(), tt.get_month(), tt.get_day(), tzinfo=local_tz())

    tz = tt.get_timezone()
    if tz is not None:
        return datetime.fromtimestamp(tt.as_timet_with_zone(tz)).astimezone()
    if tt.is_utc():
        return datetime.fromtimestamp(tt.as_timet()).astimezone()
    # Floating time: the raw components are already local wall-clock.
    return datetime(
        tt.get_year(),
        tt.get_month(),
        tt.get_day(),
        tt.get_hour(),
        tt.get_minute(),
        tt.get_second(),
        tzinfo=local_tz(),
    )


def status_name(comp):
    status = comp.get_status()
    try:
        return ICalGLib.property_status_to_string(status).upper()
    except Exception:
        return "CONFIRMED"


def component_url(comp):
    try:
        prop = comp.get_first_property(ICalGLib.PropertyKind.URL_PROPERTY)
        return prop.get_value() if prop else ""
    except Exception:
        return ""


def component_to_event(comp, start_dt, end_dt, calendar, color):
    dtstart = comp.get_dtstart()
    all_day = dtstart is not None and dtstart.is_date()

    if start_dt is None:
        start_dt = end_dt
    if start_dt is None:
        return None
    if end_dt is None:
        end_dt = start_dt + (timedelta(days=1) if all_day else timedelta(hours=1))

    return {
        "uid": comp.get_uid() or "",
        "title": comp.get_summary() or "(No title)",
        "calendar": calendar,
        "color": color or FALLBACK_COLOR,
        "location": comp.get_location() or "",
        "description": comp.get_description() or "",
        "url": component_url(comp) or "",
        "allDay": all_day,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "startMs": int(start_dt.timestamp() * 1000),
        "endMs": int(end_dt.timestamp() * 1000),
        "status": status_name(comp),
    }


def get_events(days):
    now = datetime.now()
    range_start = datetime.combine(now.date(), time.min)
    range_end = range_start + timedelta(days=days)
    start_epoch = int(range_start.timestamp())
    end_epoch = int(range_end.timestamp())

    registry = EDataServer.SourceRegistry.new_sync(None)
    sources = registry.list_sources(EDataServer.SOURCE_EXTENSION_CALENDAR)

    events = []

    for source in sources:
        if not source.get_enabled():
            continue

        cal_ext = source.get_extension(EDataServer.SOURCE_EXTENSION_CALENDAR)
        color = cal_ext.get_color() if cal_ext else None
        calendar = source.get_display_name()

        try:
            client = ECal.Client.connect_sync(
                source, ECal.ClientSourceType.EVENTS, 1, None
            )
        except Exception:
            continue

        def on_instance(comp, instance_start, instance_end, _user_data):
            event = component_to_event(
                comp,
                time_to_datetime(instance_start),
                time_to_datetime(instance_end),
                calendar,
                color,
            )
            if event is not None:
                events.append(event)
            return True

        try:
            client.generate_instances_sync(start_epoch, end_epoch, None, on_instance)
        except Exception:
            continue

    # All-day events first, then by start time.
    events.sort(key=lambda e: (not e["allDay"], e["startMs"], e["title"]))
    return events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=1)
    args = parser.parse_args()

    try:
        events = get_events(max(1, args.days))
    except Exception:
        events = []

    print(json.dumps(events), flush=True)


if __name__ == "__main__":
    main()
