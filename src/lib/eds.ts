import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Cache, environment, getPreferenceValues } from "@vicinae/api";
import { type CalendarEvent, parseEvents } from "./events";

const execFileAsync = promisify(execFile);
const cache = new Cache({ namespace: "events" });
const CACHE_KEY = "events";

export interface EventCache {
	fetchedAt: number;
	events: CalendarEvent[];
}

export interface EventsResult extends EventCache {
	fromCache: boolean;
}

export function readEventCache(): EventCache | undefined {
	const raw = cache.get(CACHE_KEY);
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
	const python = (prefs.python || "python3").trim();
	const days = Math.max(1, Number(prefs.lookaheadDays) || 1);

	const { stdout } = await execFileAsync(python, [helper, "--days", String(days)], {
		timeout: 30_000,
		maxBuffer: 16 * 1024 * 1024,
	});

	const events = parseEvents(stdout.trim());
	cache.set(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), events }));
	return events;
}

export async function getEvents(
	options: { force?: boolean } = {},
): Promise<EventsResult> {
	const prefs = getPreferenceValues<Preferences>();
	const pollMinutes = Math.max(1, Number(prefs.pollInterval) || 15);
	const cached = readEventCache();

	if (
		!options.force &&
		cached &&
		Date.now() - cached.fetchedAt < pollMinutes * 60_000
	) {
		return { ...cached, fromCache: true };
	}

	try {
		const events = await runHelper();
		return { events, fetchedAt: Date.now(), fromCache: false };
	} catch {
		// EDS down or helper broken: fall back to the last known data.
		if (cached) return { ...cached, fromCache: true };
		return { events: [], fetchedAt: 0, fromCache: false };
	}
}
