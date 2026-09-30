import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "assets", "notify-event.sh");

/** Fake notify-send/xdg-open that append their argv to the given log files. */
function fakeBin(name: string, scriptBody: string): { dir: string; log: string } {
	const dir = mkdtempSync(join(tmpdir(), "notify-event-"));
	const log = join(dir, `${name}.log`);
	const bin = join(dir, name);
	writeFileSync(bin, scriptBody);
	chmodSync(bin, 0o755);
	return { dir, log };
}

function run(url: string): { notify: string[]; opened: string[] } {
	const notify = fakeBin("notify-send", `#!/bin/sh\nprintf '%s\\n' "$@" >> "$NOTIFY_LOG"\nprintf 'default\\n'\n`);
	const opener = fakeBin("xdg-open", `#!/bin/sh\nprintf '%s\\n' "$1" >> "$OPEN_LOG"\n`);
	const result = spawnSync(
		"sh",
		[script, url, "Standup", "09:30 – 09:45"],
		{
			env: {
				...process.env,
				PATH: `${notify.dir}:${opener.dir}:${process.env.PATH}`,
				NOTIFY_LOG: notify.log,
				OPEN_LOG: opener.log,
			},
		},
	);
	assert.equal(result.status, 0, result.stderr.toString());

	const read = (path: string) =>
		existsSync(path)
			? readFileSync(path, "utf8").split("\n").filter(Boolean)
			: [];
	return { notify: read(notify.log), opened: read(opener.log) };
}

test("sticky notification offers Open and opens the link on click", () => {
	const { notify, opened } = run("https://meet.example.com/standup");

	assert.ok(notify.includes("critical"));
	assert.equal(notify[notify.indexOf("-t") + 1], "0");
	assert.equal(notify[notify.indexOf("-A") + 1], "default=Open");
	assert.deepEqual(opened, ["https://meet.example.com/standup"]);
});

test("no URL means no action and nothing opened", () => {
	const { notify, opened } = run("");

	assert.equal(notify.includes("-A"), false);
	assert.deepEqual(opened, []);
});
