import { LocalStorage, getPreferenceValues, sendDesktopNotification } from "@vicinae/api";
import { getEvents } from "./lib/eds";
import { dedupKey, dueEvents, notificationBody } from "./lib/events";

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

		await sendDesktopNotification({
			title: event.title,
			body: notificationBody(event),
			urgency: "Normal",
		});
		await LocalStorage.setItem(key, now);
	}

	await pruneDedupKeys(now);
}
