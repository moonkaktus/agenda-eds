import {
	Action,
	ActionPanel,
	Icon,
	List,
	updateCommandMetadata,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEvents, readEventCache } from "./lib/eds";
import {
	type CalendarEvent,
	formatEventTime,
	formatTime,
	groupByDay,
} from "./lib/events";

function detailMarkdown(event: CalendarEvent): string {
	return [
		`# ${event.title}`,
		event.location ? `**Location:** ${event.location}` : "",
		`**Calendar:** ${event.calendar}`,
		event.description,
	]
		.filter(Boolean)
		.join("\n\n");
}

function EventActions({
	event,
	showDetail,
	onToggleDetail,
	onRefresh,
}: {
	event: CalendarEvent;
	showDetail: boolean;
	onToggleDetail: () => void;
	onRefresh: () => void;
}) {
	return (
		<ActionPanel>
			<Action.CopyToClipboard title="Copy Title" content={event.title} />
			{event.location ? (
				<Action.CopyToClipboard
					title="Copy Location"
					content={event.location}
				/>
			) : null}
			<Action
				title={showDetail ? "Hide Details" : "Show Details"}
				icon={Icon.Eye}
				onAction={onToggleDetail}
			/>
			<Action title="Refresh" icon={Icon.ArrowClockwise} onAction={onRefresh} />
		</ActionPanel>
	);
}

export default function Agenda() {
	const [events, setEvents] = useState<CalendarEvent[]>(
		() => readEventCache()?.events ?? [],
	);
	const [isLoading, setIsLoading] = useState(true);
	const [showDetail, setShowDetail] = useState(false);

	const load = useCallback(async (force: boolean) => {
		setIsLoading(true);
		const result = await getEvents({ force });
		setEvents(result.events);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		load(false);
	}, [load]);

	useEffect(() => {
		updateCommandMetadata({
			subtitle: events.length === 1 ? "1 event" : `${events.length} events`,
		});
	}, [events.length]);

	const groups = useMemo(() => groupByDay(events), [events]);

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={showDetail}
			searchBarPlaceholder="Search events…"
			navigationTitle="Agenda"
		>
			{groups.length === 0 && !isLoading ? (
				<List.EmptyView
					icon={Icon.Calendar}
					title="No upcoming events"
					description="Nothing found in the configured lookahead window."
					actions={
						<ActionPanel>
							<Action
								title="Refresh"
								icon={Icon.ArrowClockwise}
								onAction={() => load(true)}
							/>
						</ActionPanel>
					}
				/>
			) : (
				groups.map((group) => (
					<List.Section key={group.key} title={group.label}>
						{group.events.map((event) => (
							<List.Item
								key={`${event.uid}:${event.startMs}`}
								icon={{ source: Icon.Calendar, tintColor: event.color }}
								title={event.title}
								subtitle={[formatEventTime(event), event.location]
									.filter(Boolean)
									.join(" · ")}
								accessories={[
									{ text: event.allDay ? "All day" : formatTime(event.startMs) },
									{ tag: { value: event.calendar, color: event.color } },
								]}
								detail={
									showDetail ? (
										<List.Item.Detail markdown={detailMarkdown(event)} />
									) : undefined
								}
								actions={
									<EventActions
										event={event}
										showDetail={showDetail}
										onToggleDetail={() => setShowDetail((value) => !value)}
										onRefresh={() => load(true)}
									/>
								}
							/>
						))}
					</List.Section>
				))
			)}
		</List>
	);
}
