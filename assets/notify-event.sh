#!/bin/sh
# Sticky calendar notification via libnotify.
#
# Usage: notify-event.sh <url> <title> <body>
#
# `-u critical -t 0` asks the daemon to keep the notification until the user
# dismisses it. A URL adds `-A default=Open`, so clicking the notification runs
# xdg-open on the link (fnott/dunst activate the "default" action on body
# click); notify-send then waits for the user, so run this detached.
url=$1
title=$2
body=$3

action=$(notify-send -u critical -t 0 -a "Calendar (EDS)" -i calendar ${url:+-A default=Open} "$title" "$body")
[ "$action" = default ] && xdg-open "$url" >/dev/null 2>&1
