import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	updateCommandMetadata,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEvents, readEventCache } from "./lib/eds";
import {
	type CalendarEvent,
	eventState,
	eventUrl,
	formatEventTime,
	groupByDay,
} from "./lib/events";

function detailMarkdown(event: CalendarEvent): string {
	const meta = [formatEventTime(event), event.location].filter(Boolean).join("  ·  ");
	return [`# ${event.title}`, `**${meta}**`, event.description]
		.filter(Boolean)
		.join("\n\n");
}

function EventActions({
	event,
	showingDetail,
	onToggleDetail,
	onRefresh,
}: {
	event: CalendarEvent;
	showingDetail: boolean;
	onToggleDetail: () => void;
	onRefresh: () => void;
}) {
	const url = eventUrl(event);
	return (
		<ActionPanel>
			{url ? (
				<Action.OpenInBrowser
					title="Open Event Link"
					icon={Icon.Globe01}
					url={url}
				/>
			) : null}
			<Action.CopyToClipboard title="Copy Title" content={event.title} />
			{event.location ? (
				<Action.CopyToClipboard
					title="Copy Location"
					content={event.location}
				/>
			) : null}
			{url ? <Action.CopyToClipboard title="Copy Link" content={url} /> : null}
			<Action
				title={showingDetail ? "Hide Details" : "Show Details"}
				icon={Icon.Eye}
				shortcut={{ modifiers: ["ctrl"], key: "d" }}
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
	const [showDetail, setShowDetail] = useState(true);
	const [now, setNow] = useState(() => Date.now());

	const load = useCallback(async (force: boolean) => {
		setIsLoading(true);
		const result = await getEvents({ force });
		setEvents(result.events);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		load(false);
	}, [load]);

	// Keep the past/current highlighting fresh while the view is open.
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(timer);
	}, []);

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
					<List.Section
						key={group.key}
						title={`${group.label} (${group.events.length})`}
					>
						{group.events.map((event) => {
							const url = eventUrl(event);
							const state = eventState(event, now);
							const dimmed = state === "past";
							// All-day events are "current" the whole day; don't flag them as Now.
							const accent = state === "current" && !event.allDay;

							const accessories: List.Item.Accessory[] = [
								{
									text: {
										value: formatEventTime(event),
										color: dimmed
											? Color.SecondaryText
											: accent
												? Color.Green
												: Color.PrimaryText,
									},
								},
							];
							if (accent) {
								accessories.push({ tag: { value: "Now", color: Color.Green } });
							}

							return (
								<List.Item
									key={`${event.uid}:${event.startMs}`}
									icon={{
										source: Icon.Calendar,
										tintColor: dimmed
											? Color.SecondaryText
											: accent
												? Color.Green
												: event.color,
									}}
									title={event.title}
									keywords={[event.location, event.calendar].filter(Boolean)}
									subtitle={
										showDetail
											? undefined
											: [formatEventTime(event), event.location]
													.filter(Boolean)
													.join(" · ")
									}
									accessories={accessories}
									detail={
										<List.Item.Detail
											markdown={detailMarkdown(event)}
											metadata={
												<List.Item.Detail.Metadata>
													<List.Item.Detail.Metadata.Label
														title="When"
														text={formatEventTime(event)}
													/>
													<List.Item.Detail.Metadata.Label
														title="Calendar"
														text={event.calendar}
													/>
													{event.status && event.status !== "CONFIRMED" ? (
														<List.Item.Detail.Metadata.Label
															title="Status"
															text={event.status}
														/>
													) : null}
													{event.location ? (
														<List.Item.Detail.Metadata.Label
															title="Location"
															text={event.location}
														/>
													) : null}
													{url ? (
														<List.Item.Detail.Metadata.Link
															title="Link"
															target={url}
															text={url}
														/>
													) : null}
												</List.Item.Detail.Metadata>
											}
										/>
									}
									actions={
										<EventActions
											event={event}
											showingDetail={showDetail}
											onToggleDetail={() => setShowDetail((value) => !value)}
											onRefresh={() => load(true)}
										/>
									}
								/>
							);
						})}
					</List.Section>
				))
			)}
		</List>
	);
}
