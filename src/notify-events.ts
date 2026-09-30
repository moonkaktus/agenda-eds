import {
	LocalStorage,
	environment,
	getPreferenceValues,
} from "@vicinae/api";
import { spawn } from "node:child_process";
import { getEvents } from "./lib/eds";
import {
	type CalendarEvent,
	dedupKey,
	dueEvents,
	eventUrl,
	notificationBody,
} from "./lib/events";

const PRUNE_AFTER_MS = 2 * 86_400_000;

async function pruneDedupKeys(now: number): Promise<void> {
	const items = await LocalStorage.allItems();
	await Promise.all(
		Object.entries(items)
			.filter(
				([key, value]) =>
					key.includes(":") &&
					typeof value === "number" &&
					now - value > PRUNE_AFTER_MS,
			)
			.map(([key]) => LocalStorage.removeItem(key)),
	);
}

/**
 * Send through notify-send rather than the vicinae API: the API hardcodes a
 * server-default timeout and has no actions, while libnotify can keep the
 * notification on screen (`-t 0`) and open the event link on click.
 */
function notifyEvent(event: CalendarEvent): void {
	const child = spawn(
		"sh",
		[
			`${environment.assetsPath}/notify-event.sh`,
			eventUrl(event) ?? "",
			event.title,
			notificationBody(event),
		],
		{ detached: true, stdio: "ignore" },
	);
	child.unref();
	// Only guards an absent `sh`; a missing script exits instead of erroring.
	child.on("error", () => {});
}

/**
 * Runs once a minute. The EDS query is throttled by the pollInterval
 * preference, so most ticks are a cache read plus a bit of arithmetic.
 */
export default async function NotifyEvents(): Promise<void> {
	const prefs = getPreferenceValues<Preferences>();
	const leadMs = Math.max(0, Number(prefs.notifyLead) || 0) * 60_000;
	const now = Date.now();

	const { events } = await getEvents();

	for (const event of dueEvents(events, now, leadMs)) {
		const key = dedupKey(event);
		if (await LocalStorage.getItem(key)) continue;

		notifyEvent(event);
		await LocalStorage.setItem(key, now);
	}

	await pruneDedupKeys(now);
}
