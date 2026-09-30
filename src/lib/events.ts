/**
 * Pure event helpers, kept free of @vicinae/api imports so they can be
 * unit-tested outside the vicinae host.
 */

export interface CalendarEvent {
	uid: string;
	title: string;
	calendar: string;
	color: string;
	location: string;
	description: string;
	url?: string;
	allDay: boolean;
	startMs: number;
	endMs: number;
	status: string;
}

export interface DayGroup {
	key: string;
	label: string;
	events: CalendarEvent[];
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
	if (typeof value !== "object" || value === null) return false;
	const event = value as Record<string, unknown>;
	return typeof event.title === "string" && typeof event.startMs === "number";
}

/** Parse the helper's stdout, tolerating malformed data by returning []. */
export function parseEvents(raw: string): CalendarEvent[] {
	try {
		const data = JSON.parse(raw);
		return Array.isArray(data) ? data.filter(isCalendarEvent) : [];
	} catch {
		return [];
	}
}

export function localDayKey(ms: number): string {
	const d = new Date(ms);
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${month}-${day}`;
}

export function dayLabel(ms: number, now: Date = new Date()): string {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const target = new Date(ms);
	target.setHours(0, 0, 0, 0);
	const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
	if (diff === 0) return "Today";
	if (diff === 1) return "Tomorrow";
	if (diff === -1) return "Yesterday";
	return target.toLocaleDateString(undefined, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

export function formatTime(ms: number): string {
	return new Date(ms).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

const URL_RE = /https?:\/\/[^\s<>"'`)]+/i;

/** First http(s) URL across the given fields, trailing punctuation trimmed. */
export function extractUrl(
	...texts: Array<string | undefined>
): string | undefined {
	for (const text of texts) {
		if (!text) continue;
		const match = URL_RE.exec(text);
		if (match) return match[0].replace(/[.,;:]+$/, "");
	}
	return undefined;
}

/** Best link for an event: its URL property, then location, then description. */
export function eventUrl(event: CalendarEvent): string | undefined {
	return extractUrl(event.url, event.location, event.description);
}

export function formatEventTime(event: CalendarEvent): string {
	if (event.allDay) return "All day";
	const start = formatTime(event.startMs);
	if (localDayKey(event.startMs) !== localDayKey(event.endMs)) return start;
	const end = formatTime(event.endMs);
	return end === start ? start : `${start} – ${end}`;
}

/** Group events by local day, chronological, all-day events first within a day. */
export function groupByDay(
	events: CalendarEvent[],
	now: Date = new Date(),
): DayGroup[] {
	const groups = new Map<string, CalendarEvent[]>();
	for (const event of events) {
		const key = localDayKey(event.startMs);
		let list = groups.get(key);
		if (!list) {
			list = [];
			groups.set(key, list);
		}
		list.push(event);
	}

	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, list]) => ({
			key,
			label: dayLabel(list[0].startMs, now),
			events: [...list].sort((a, b) => a.startMs - b.startMs),
		}));
}

export type EventState = "past" | "current" | "upcoming";

/** Where `now` sits relative to an event's half-open [start, end) range. */
export function eventState(event: CalendarEvent, now: number): EventState {
	if (event.endMs <= now) return "past";
	if (event.startMs <= now) return "current";
	return "upcoming";
}

/** Stable identity for one occurrence, used for notification dedup. */
export function dedupKey(event: CalendarEvent): string {
	return `${event.uid}:${event.startMs}`;
}

/** Timed, non-cancelled events starting within [now - 1m, now + leadMs]. */
export function dueEvents(
	events: CalendarEvent[],
	now: number,
	leadMs: number,
): CalendarEvent[] {
	return events.filter(
		(event) =>
			!event.allDay &&
			event.status.toUpperCase() !== "CANCELLED" &&
			event.startMs - now <= leadMs &&
			event.startMs > now - 60_000,
	);
}

export function notificationBody(event: CalendarEvent): string {
	const location = event.location ? ` · ${event.location}` : "";
	return `${formatEventTime(event)}${location}`;
}
