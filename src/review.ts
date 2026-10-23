// The review extension's entries, as `public/review.md` specifies them,
// folded from the log into the threads of one paper.
import type { Entry } from "byoa/participant";

export const PDF = "application/pdf";
export const THREAD = "application/vnd.byoa.review.thread+json";
export const REPLY = "application/vnd.byoa.review.reply+json";
export const PLACE = "application/vnd.byoa.review.place+json";

/** `[x, y, width, height]`, each a fraction of the page. */
export type Rect = [number, number, number, number];

export type Message = { n: number; from: string; time: string; text: string };

export type Thread = {
	n: number;
	from: string;
	page: number;
	quote: string;
	rects: Rect[];
	messages: Message[];
	place: { x: number; y: number } | null;
};

export const base = (type: string) => type.split(";")[0]?.trim() ?? "";

function json(entry: Entry): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(entry.text ?? "");
		return value && typeof value === "object"
			? (value as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

const isRect = (r: unknown): r is Rect =>
	Array.isArray(r) &&
	r.length === 4 &&
	r.every((v) => typeof v === "number" && Number.isFinite(v));

/** The paper under review: the latest PDF sent. */
export function paperOf(entries: Entry[]): Entry | null {
	return entries.findLast((entry) => base(entry.type) === PDF) ?? null;
}

/** The threads about `paper`, oldest first, with their replies and place. */
export function threadsOf(entries: Entry[], paper: number): Thread[] {
	const threads = new Map<number, Thread>();
	for (const entry of entries) {
		const type = base(entry.type);
		const value = json(entry);
		if (!value) continue;
		if (type === THREAD) {
			if (value.paper !== paper || typeof value.page !== "number") continue;
			const text = typeof value.text === "string" ? value.text : "";
			threads.set(entry.n, {
				n: entry.n,
				from: entry.from,
				page: value.page,
				quote: typeof value.quote === "string" ? value.quote : "",
				rects: Array.isArray(value.rects) ? value.rects.filter(isRect) : [],
				messages: text
					? [{ n: entry.n, from: entry.from, time: entry.time, text }]
					: [],
				place: null,
			});
		} else if (type === REPLY || type === PLACE) {
			const thread = threads.get(value.thread as number);
			if (!thread) continue;
			if (type === REPLY && typeof value.text === "string") {
				thread.messages.push({
					n: entry.n,
					from: entry.from,
					time: entry.time,
					text: value.text,
				});
			} else if (
				type === PLACE &&
				typeof value.x === "number" &&
				typeof value.y === "number"
			) {
				thread.place = { x: value.x, y: value.y };
			}
		}
	}
	return [...threads.values()];
}

/** A colour of its own for every name. */
export function hue(name: string): number {
	let h = 0;
	for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
	return h;
}
