import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Cache, environment, getPreferenceValues } from "@vicinae/api";
import { type CalendarEvent, parseEvents } from "./events";

const execFileAsync = promisify(execFile);
const cache = new Cache({ namespace: "events" });

export interface EventCache {
	fetchedAt: number;
	events: CalendarEvent[];
}

function lookaheadDays(): number {
	const prefs = getPreferenceValues<Preferences>();
	return Math.max(1, Number(prefs.lookaheadDays) || 1);
}

// The lookahead window is part of the key: changing the preference must not
// reuse a cache entry fetched for a different range.
function cacheKey(days: number): string {
	return `events:days=${days}`;
}

export function readEventCache(): EventCache | undefined {
	const raw = cache.get(cacheKey(lookaheadDays()));
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as EventCache;
		return Array.isArray(parsed?.events) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

async function runHelper(): Promise<CalendarEvent[]> {
	const prefs = getPreferenceValues<Preferences>();
	const helper = `${environment.assetsPath}/eds-helper.py`;
	const python = (prefs.python || "eds-python").trim();
	const days = lookaheadDays();

	const { stdout } = await execFileAsync(python, [helper, "--days", String(days)], {
		timeout: 30_000,
		maxBuffer: 16 * 1024 * 1024,
	});

	const events = parseEvents(stdout.trim());
	cache.set(
		cacheKey(days),
		JSON.stringify({ fetchedAt: Date.now(), events }),
	);
	return events;
}

export async function getEvents(
	options: { force?: boolean } = {},
): Promise<EventCache> {
	const prefs = getPreferenceValues<Preferences>();
	const pollMinutes = Math.max(1, Number(prefs.pollInterval) || 15);
	const cached = readEventCache();

	if (
		!options.force &&
		cached &&
		Date.now() - cached.fetchedAt < pollMinutes * 60_000
	) {
		return cached;
	}

	try {
		const events = await runHelper();
		return { events, fetchedAt: Date.now() };
	} catch {
		// EDS down or helper broken: fall back to the last known data.
		if (cached) return cached;
		return { events: [], fetchedAt: 0 };
	}
}
