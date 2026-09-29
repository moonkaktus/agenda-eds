// Keep the checked-in sample's fixed epochs deterministic across machines.
process.env.TZ = "Europe/Moscow";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	dayLabel,
	dedupKey,
	dueEvents,
	formatEventTime,
	formatTime,
	groupByDay,
	parseEvents,
} from "../src/lib/events.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sampleRaw = readFileSync(join(here, "sample-events.json"), "utf8");
const sample = parseEvents(sampleRaw);

test("parseEvents keeps valid events and drops junk", () => {
	assert.equal(sample.length, 5);
	assert.deepEqual(
		sample.map((event) => event.title),
		["Company offsite", "Standup", "Daily", "Daily", "Cancelled meeting"],
	);
	assert.deepEqual(parseEvents("not json"), []);
	assert.deepEqual(parseEvents('{"nope":true}'), []);
});

test("groupByDay orders days and puts all-day first within a day", () => {
	const now = new Date(2026, 8, 29, 12, 0, 0);
	const groups = groupByDay(sample, now);

	assert.deepEqual(
		groups.map((group) => group.label),
		["Today", "Tomorrow"],
	);
	assert.deepEqual(
		groups[0].events.map((event) => event.title),
		["Company offsite", "Standup", "Cancelled meeting", "Daily"],
	);
	assert.deepEqual(
		groups[1].events.map((event) => event.title),
		["Daily"],
	);
});

test("formatEventTime handles all-day, ranges and cross-day events", () => {
	const [allDay, timed, , , cancelled] = sample;
	assert.equal(formatEventTime(allDay), "All day");
	assert.equal(
		formatEventTime(timed),
		`${formatTime(timed.startMs)} – ${formatTime(timed.endMs)}`,
	);

	const crossDay = { ...timed, endMs: timed.startMs + 20 * 60 * 60 * 1000 };
	assert.equal(formatEventTime(crossDay), formatTime(crossDay.startMs));
	assert.equal(formatEventTime(cancelled), `${formatTime(cancelled.startMs)} – ${formatTime(cancelled.endMs)}`);
});

test("dayLabel knows today and tomorrow", () => {
	const now = new Date(2026, 8, 29, 12, 0, 0);
	assert.equal(dayLabel(new Date(2026, 8, 29, 8).getTime(), now), "Today");
	assert.equal(dayLabel(new Date(2026, 8, 30, 8).getTime(), now), "Tomorrow");
	assert.equal(dayLabel(new Date(2026, 8, 28, 8).getTime(), now), "Yesterday");
});

test("dueEvents only emits imminent, non-cancelled timed events", () => {
	const standup = sample.find((event) => event.uid === "timed-1")!;
	const lead = 3 * 60_000;

	const dueNow = dueEvents(sample, standup.startMs - 2 * 60_000, lead);
	assert.deepEqual(
		dueNow.map((event) => event.uid),
		["timed-1"],
	);

	assert.deepEqual(dueEvents(sample, standup.startMs - 10 * 60_000, lead), []);
	assert.deepEqual(dueEvents(sample, standup.startMs + 2 * 60_000, lead), []);
});

test("dedupKey separates recurring occurrences", () => {
	const [first, second] = sample.filter((event) => event.uid === "recurring-1");
	assert.notEqual(dedupKey(first), dedupKey(second));
	assert.equal(dedupKey(first), `recurring-1:${first.startMs}`);
});
