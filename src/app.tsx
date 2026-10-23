// A page to review a paper together, on a session of the byoa transport.
// The PDF lies on a desk; every marked passage gets a bubble that floats
// beside it, wherever anyone drags it, where everyone discusses it. A chat
// for the rest can be opened beside it.
import { type Entry, JOIN, LEAVE, type Session } from "byoa/participant";
import { Named, Onboard } from "byoa-web/onboard";
import { useSession } from "byoa-web/react";
import {
	ChevronDown,
	ChevronUp,
	FileUp,
	LogOut,
	MessageSquare,
	Minus,
	Plus,
	RotateCcw,
	UserPlus,
	X,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { Button } from "@/components/ui/button.tsx";
import { type Doc, findQuote, Page, useDoc } from "./paper.tsx";
import {
	base,
	hue,
	PDF,
	PLACE,
	paperOf,
	REPLY,
	type Rect,
	THREAD,
	type Thread,
	threadsOf,
} from "./review.ts";

/** Payloads larger than this are refused by the relay. */
const MAX_BYTES = 10 * 1024 * 1024;
/** A bubble's width, and its distance from the page. */
const BUBBLE = 300;
/** The smallest a bubble can be resized to. */
const MIN_W = 220;
const MIN_H = 110;

/** How far a bubble was resized, in pixels: grown on its left and right,
 * and its height, if someone chose one. */
type Size = { l: number; r: number; h: number | null };
const NATURAL: Size = { l: 0, r: 0, h: null };
const GAP = 56;
const PAGE_GAP = 28;
const TOP = 48;

const SERVICE = "byoa-paper-review";

export function App() {
	return <Named service={SERVICE}>{(name) => <Review name={name} />}</Named>;
}

const color = (name: string, alpha = 1) =>
	`oklch(0.68 0.16 ${hue(name)} / ${alpha})`;

function Md({ children }: { children: string }) {
	return (
		<div className="prose prose-sm max-w-none break-words dark:prose-invert prose-p:my-1 prose-pre:my-1 prose-ul:my-1">
			<Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
				{children}
			</Markdown>
		</div>
	);
}

/** The bounding box of `rects`. */
function bounds(rects: Rect[]): Rect | null {
	if (rects.length === 0) return null;
	let [x0, y0, x1, y1] = [1, 1, 0, 0];
	for (const [x, y, w, h] of rects) {
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x + w);
		y1 = Math.max(y1, y + h);
	}
	return [x0, y0, x1 - x0, y1 - y0];
}

type Selected = { page: number; quote: string; rects: Rect[]; at: DOMRect };

/** The passage marked in the paper, if any. */
function readSelection(): Selected | null {
	const selection = getSelection();
	if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
	const quote = selection.toString().replace(/\s+/g, " ").trim();
	if (quote.length < 2) return null;
	const node = selection.anchorNode;
	const el = node instanceof Element ? node : node?.parentElement;
	const pageEl = el?.closest<HTMLElement>("[data-page]");
	if (!pageEl) return null;
	const range = selection.getRangeAt(0);
	const p = pageEl.getBoundingClientRect();
	const rects: Rect[] = [];
	for (const r of range.getClientRects()) {
		const x0 = Math.max(r.left, p.left);
		const x1 = Math.min(r.right, p.right);
		const y0 = Math.max(r.top, p.top);
		const y1 = Math.min(r.bottom, p.bottom);
		if (x1 - x0 < 2 || y1 - y0 < 2) continue;
		rects.push(
			[
				(x0 - p.left) / p.width,
				(y0 - p.top) / p.height,
				(x1 - x0) / p.width,
				(y1 - y0) / p.height,
			].map((v) => Math.round(v * 1e4) / 1e4) as Rect,
		);
		if (rects.length >= 60) break;
	}
	return {
		page: Number(pageEl.dataset.page),
		quote: quote.slice(0, 2000),
		rects,
		at: range.getBoundingClientRect(),
	};
}

/** The review, taking part under the person's `name`. */
function Review({ name }: { name: string }) {
	const page = useSession(name);
	const { session, entries, presence, alone, leave } = page;
	// Whether the person chose to start before anyone else joined.
	const [solo, setSolo] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [chatOpen, setChatOpen] = useState(false);
	const [zoom, setZoom] = useState(1);
	const picker = useRef<HTMLInputElement>(null);

	const paper = paperOf(entries);
	const paperN = paper?.n;
	const load = useMemo(
		() =>
			session && paperN
				? async () => (await session.fetch(paperN)).arrayBuffer()
				: null,
		[session, paperN],
	);
	const { doc, problem: docProblem } = useDoc(load, paperN);
	const threads = useMemo(
		() => (paper ? threadsOf(entries, paper.n) : []),
		[entries, paper],
	);
	const problem = page.problem ?? failure ?? docProblem;

	const send = useCallback(
		async (
			body: string | Blob,
			options: { type: string; filename?: string },
		) => {
			if (!session) return null;
			try {
				setFailure(null);
				return await session.send(body, options);
			} catch (error) {
				setFailure((error as Error).message);
				return null;
			}
		},
		[session],
	);
	const sendJson = useCallback(
		(type: string, value: object) => send(JSON.stringify(value), { type }),
		[send],
	);

	const upload = async (files: Iterable<File>) => {
		for (const file of files) {
			if (file.type !== PDF && !file.name.toLowerCase().endsWith(".pdf")) {
				setFailure(`${file.name} is no PDF.`);
				continue;
			}
			if (file.size > MAX_BYTES) {
				setFailure(`${file.name} is over 10 MB.`);
				continue;
			}
			await send(file, { type: PDF, filename: file.name });
		}
	};

	const chat = entries.filter(
		(entry) =>
			(base(entry.type).startsWith("text/") && !entry.filename) ||
			((entry.type === JOIN || entry.type === LEAVE) && entry.from !== name),
	);
	const [seenChat, setSeenChat] = useState(0);
	const lastChat = chat.at(-1)?.n ?? 0;
	useEffect(() => {
		if (chatOpen) setSeenChat(lastChat);
	}, [chatOpen, lastChat]);
	const unread = chat.filter(
		(entry) => entry.n > seenChat && entry.from !== name && entry.text,
	).length;

	const others = Object.entries(presence).filter(([other]) => other !== name);
	const token = session
		? (new URL(session.link).pathname.split("/").pop() ?? "")
		: "";

	if (session && alone && !solo && !paper) {
		return (
			<Onboard
				name={SERVICE}
				title="Review a paper with your agent"
				description="Read a PDF together, mark passages, and discuss each one in a bubble beside it, with your agent and anyone you invite."
				token={token}
				note={
					<span className="flex flex-col items-start gap-2">
						<span>
							Rather read first, or invite people? Your agent can join any time
							later, with the prompt under Invite.
						</span>
						<Button variant="outline" onClick={() => setSolo(true)}>
							Start without an agent
						</Button>
					</span>
				}
			/>
		);
	}

	return (
		<main className="flex h-dvh flex-col bg-desk">
			<header className="z-30 flex flex-wrap items-center gap-2 border-b bg-card/80 px-4 py-2 backdrop-blur">
				<span className="font-semibold tracking-tight">
					paper<span className="text-muted-foreground">·</span>review
				</span>
				<span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
					{paper?.filename ?? ""}
				</span>
				<div className="flex items-center gap-1">
					{[...others].map(([other, { receiving }]) => (
						<span
							key={other}
							title={`${other}: ${receiving ? "here" : "away"}`}
							className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-black"
							style={{
								background: color(other),
								opacity: receiving ? 1 : 0.4,
							}}
						>
							{other.slice(0, 2).toUpperCase()}
						</span>
					))}
				</div>
				{doc && (
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Zoom out"
							onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
						>
							<Minus />
						</Button>
						<span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
							{Math.round(zoom * 100)}%
						</span>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Zoom in"
							onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
						>
							<Plus />
						</Button>
					</div>
				)}
				<input
					ref={picker}
					type="file"
					accept="application/pdf,.pdf"
					hidden
					onChange={(event) => {
						if (event.target.files) void upload(event.target.files);
						event.target.value = "";
					}}
				/>
				<Button
					variant="outline"
					size="sm"
					disabled={!session}
					onClick={() => picker.current?.click()}
				>
					<FileUp /> {paper ? "New paper" : "Add paper"}
				</Button>
				<Invite token={token} />
				<Button
					variant={chatOpen ? "default" : "outline"}
					size="sm"
					onClick={() => setChatOpen((open) => !open)}
				>
					<MessageSquare /> Chat
					{unread > 0 && !chatOpen && (
						<span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
							{unread}
						</span>
					)}
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={!session}
					aria-label="Leave"
					title="Leave the session: once everyone has left, it is deleted"
					onClick={leave}
				>
					<LogOut />
				</Button>
			</header>
			{problem && (
				<p className="z-30 bg-destructive/15 px-4 py-1.5 text-sm text-destructive">
					{problem}
				</p>
			)}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: a PDF can be dropped anywhere */}
			<div
				className="relative min-h-0 flex-1"
				onDragOver={(event) => event.preventDefault()}
				onDrop={(event) => {
					event.preventDefault();
					void upload(event.dataTransfer.files);
				}}
			>
				{doc && paper && session ? (
					<Desk
						doc={doc}
						paper={paper.n}
						zoom={zoom}
						threads={threads}
						session={session}
						presence={presence}
						sendJson={sendJson}
					/>
				) : (
					<Empty
						waiting={!!paper}
						onPick={() => picker.current?.click()}
						disabled={!session}
					/>
				)}
				{chatOpen && session && (
					<Chat
						entries={chat}
						session={session}
						send={send}
						onClose={() => setChatOpen(false)}
					/>
				)}
			</div>
		</main>
	);
}

function Empty({
	waiting,
	onPick,
	disabled,
}: {
	waiting: boolean;
	onPick: () => void;
	disabled: boolean;
}) {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<div className="panel flex max-w-md flex-col items-center gap-4 border-dashed p-10 text-center text-muted-foreground">
				{waiting ? (
					<p>Opening the paper…</p>
				) : (
					<>
						<h1 className="text-2xl font-semibold text-foreground">
							Read a paper together
						</h1>
						<p>
							Drop a PDF here. Everyone in the session sees it, marks passages,
							and discusses each one beside it.
						</p>
						<Button disabled={disabled} onClick={onPick}>
							<FileUp /> Add paper
						</Button>
					</>
				)}
			</div>
		</div>
	);
}

function Invite({ token }: { token: string }) {
	const [open, setOpen] = useState(false);
	const prompt = `Read ${location.origin}/agents.md and join with session token ${token}`;
	return (
		<div className="relative">
			<Button
				variant="outline"
				size="sm"
				disabled={!token}
				onClick={() => setOpen((o) => !o)}
			>
				<UserPlus /> Invite
			</Button>
			{open && (
				<div className="panel absolute right-0 top-10 z-40 flex w-80 flex-col gap-3 p-3 text-sm">
					<CopyRow label="People: this page's link" text={location.href} />
					<CopyRow label="Agents: give them this prompt" text={prompt} />
					<p className="text-xs text-muted-foreground">
						Both are secret: whoever has them can take part.
					</p>
				</div>
			)}
		</div>
	);
}

function CopyRow({ label, text }: { label: string; text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs text-muted-foreground">{label}</span>
			<div className="flex gap-2">
				<code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
					{text}
				</code>
				<Button
					size="sm"
					variant="secondary"
					onClick={async () => {
						await navigator.clipboard.writeText(text);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? "Copied" : "Copy"}
				</Button>
			</div>
		</div>
	);
}

type SendJson = (type: string, value: object) => Promise<number | null>;
type Pos = { left: number; top: number };

/** The desk: the pages in a column, and the bubbles floating around them. */
function Desk({
	doc,
	paper,
	zoom,
	threads,
	session,
	presence,
	sendJson,
}: {
	doc: Doc;
	paper: number;
	zoom: number;
	threads: Thread[];
	session: Session;
	presence: Record<string, { read: number }>;
	sendJson: SendJson;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const [view, setView] = useState(1200);
	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const observer = new ResizeObserver(() => setView(el.clientWidth));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const width = Math.round(
		Math.min(860, Math.max(420, view - 2 * (BUBBLE + GAP + 24))) * zoom,
	);
	const side = Math.max(BUBBLE + GAP + 24, (view - width) / 2);
	const tops: number[] = [];
	let y = TOP;
	for (const ratio of doc.ratios) {
		tops.push(y);
		y += ratio * width + PAGE_GAP;
	}
	const height = y + 200;
	const pageHeight = (p: number) => (doc.ratios[p - 1] ?? 1.3) * width;

	// Anchors of threads that came without rects, found on their page.
	const [found, setFound] = useState<Record<number, Rect[]>>({});
	useEffect(() => {
		for (const thread of threads) {
			if (thread.rects.length || thread.n in found || !thread.quote) continue;
			setFound((f) => ({ ...f, [thread.n]: [] }));
			findQuote(doc, thread.page, thread.quote)
				.then((rects) => setFound((f) => ({ ...f, [thread.n]: rects })))
				.catch(() => {});
		}
	}, [threads, doc, found]);

	const [selected, setSelected] = useState<Selected | null>(null);
	const [draft, setDraft] = useState<Selected | null>(null);
	const [dragged, setDragged] = useState<Record<number, number>>({});
	const [heights, setHeights] = useState<Record<number, number>>({});
	const [front, setFront] = useState<number[]>([]);
	const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
	const [sizes, setSizes] = useState<Record<number, Size>>({});
	const raise = (n: number) =>
		setFront((f) => [...f.filter((m) => m !== n), n]);

	const anchorOf = (rects: Rect[]) => bounds(rects);

	// Where each bubble floats, in pixels on the desk: in the column on its
	// passage's side, at the height someone dragged it to, or else beside its
	// passage, below the bubbles above it in that column.
	type Laid = {
		thread: Thread;
		rects: Rect[];
		pos: Pos;
		left: boolean;
		w: number;
		fixed: boolean;
	};
	const column = (left: boolean, size: Size) =>
		Math.max(8, (left ? side - GAP - BUBBLE : side + width + GAP) - size.l);
	const laid: Laid[] = threads
		.map((thread) => {
			const rects = thread.rects.length
				? thread.rects
				: (found[thread.n] ?? []);
			const box = anchorOf(rects);
			const pageTop = tops[thread.page - 1] ?? 0;
			const ph = pageHeight(thread.page);
			const fixed =
				dragged[thread.n] ??
				(thread.place ? pageTop + thread.place.y * ph : null);
			const size = sizes[thread.n] ?? NATURAL;
			const w = BUBBLE + size.l + size.r;
			const left = box ? box[0] + box[2] / 2 < 0.5 : true;
			return {
				thread,
				rects,
				left,
				w,
				fixed: fixed !== null,
				pos: {
					left: column(left, size),
					top: fixed ?? pageTop + (box?.[1] ?? 0) * ph - 16,
				},
			};
		})
		.sort((a, b) => a.pos.top - b.pos.top);
	const bottoms = { left: 0, right: 0 };
	for (const item of laid) {
		const s = item.left ? "left" : "right";
		if (!item.fixed) item.pos.top = Math.max(item.pos.top, bottoms[s] + 14);
		bottoms[s] =
			item.pos.top +
			(collapsed[item.thread.n] ? 44 : (heights[item.thread.n] ?? 160));
	}

	const draftPos: Pos | null = draft
		? (() => {
				const box = anchorOf(draft.rects);
				const left = box ? box[0] + box[2] / 2 < 0.5 : true;
				return {
					left: left ? side - GAP - BUBBLE : side + width + GAP,
					top:
						(tops[draft.page - 1] ?? 0) +
						(box?.[1] ?? 0) * pageHeight(draft.page) -
						16,
				};
			})()
		: null;

	const place = (thread: Thread, pos: Pos) => {
		const pageTop = tops[thread.page - 1] ?? 0;
		void sendJson(PLACE, {
			thread: thread.n,
			x: Math.round(((pos.left - side) / width) * 1e4) / 1e4,
			y:
				Math.round(((pos.top - pageTop) / pageHeight(thread.page)) * 1e4) / 1e4,
		});
	};
	// A drag is shown locally until the place it sent comes back.
	// biome-ignore lint/correctness/useExhaustiveDependencies: on every new place
	useEffect(
		() => setDragged({}),
		[threads.map((t) => `${t.place?.x},${t.place?.y}`).join()],
	);

	const lines = [
		...laid.map(({ thread, rects, pos, left, w }) => ({
			key: thread.n,
			from: thread.from,
			page: thread.page,
			rects,
			pos,
			left,
			w,
			height: collapsed[thread.n] ? 40 : (heights[thread.n] ?? 120),
		})),
		...(draft && draftPos
			? [
					{
						key: -1,
						from: session.name,
						page: draft.page,
						rects: draft.rects,
						pos: draftPos,
						left: draftPos.left < side,
						w: BUBBLE,
						height: 120,
					},
				]
			: []),
	];

	return (
		<div
			ref={scroller}
			className="absolute inset-0 overflow-auto"
			onPointerUp={(event) => {
				if ((event.target as Element).closest("[data-bubble]")) return;
				setTimeout(() => setSelected(readSelection()), 10);
			}}
			onScroll={() => setSelected(null)}
		>
			<div className="relative" style={{ width: side * 2 + width, height }}>
				{doc.ratios.map((ratio, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: pages are their index
						key={i}
						data-page={i + 1}
						className="absolute bg-white shadow-2xl shadow-black/40"
						style={{ left: side, top: tops[i], width, height: ratio * width }}
					>
						<Page doc={doc} n={i + 1} width={width} />
						<span className="absolute -top-5 left-0 font-mono text-[11px] text-muted-foreground/60">
							{i + 1}
						</span>
					</div>
				))}
				<svg
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 z-10"
					width={side * 2 + width}
					height={height}
				>
					{lines.map(({ key, from, page, rects, pos, left, w, height: h }) => {
						const box = anchorOf(rects);
						if (!box) return null;
						const pageTop = tops[page - 1] ?? 0;
						const ph = pageHeight(page);
						const pad = 4;
						const bx = side + box[0] * width - pad;
						const by = pageTop + box[1] * ph - pad;
						const bw = box[2] * width + 2 * pad;
						const bh = box[3] * ph + 2 * pad;
						const sx = left ? pos.left + w : pos.left;
						const sy = pos.top + Math.min(h, 60) / 2;
						const ex = left ? bx : bx + bw;
						const ey = by + bh / 2;
						const mid = (sx + ex) / 2;
						const stroke = color(from, front.at(-1) === key ? 0.7 : 0.4);
						return (
							<g key={key}>
								{rects.map((r, i) => (
									<rect
										// biome-ignore lint/suspicious/noArrayIndexKey: rects are fixed
										key={i}
										x={side + r[0] * width}
										y={pageTop + r[1] * ph}
										width={r[2] * width}
										height={r[3] * ph}
										fill={color(from, 0.08)}
									/>
								))}
								<rect
									x={bx}
									y={by}
									width={bw}
									height={bh}
									rx={6}
									fill="none"
									stroke={stroke}
									strokeWidth={1.2}
								/>
								<text
									x={bx + bw}
									y={by + bh + 13}
									textAnchor="end"
									fontSize={12}
									fontStyle="italic"
									fontFamily="'Segoe Script', 'Bradley Hand', cursive"
									fill={stroke}
								>
									{from}
								</text>
								<path
									d={`M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ey}, ${ex} ${ey}`}
									fill="none"
									stroke={stroke}
									strokeWidth={1.2}
								/>
							</g>
						);
					})}
				</svg>
				{laid.map(({ thread, pos, w }) => (
					<Bubble
						key={thread.n}
						thread={thread}
						pos={pos}
						width={w}
						size={sizes[thread.n] ?? NATURAL}
						onSize={(size) => setSizes((m) => ({ ...m, [thread.n]: size }))}
						z={20 + front.indexOf(thread.n) + 1}
						collapsed={!!collapsed[thread.n]}
						seenBy={Object.entries(presence)
							.filter(
								([other, { read }]) =>
									other !== session.name &&
									read >= (thread.messages.at(-1)?.n ?? thread.n),
							)
							.map(([other]) => other)}
						me={session.name}
						onRaise={() => raise(thread.n)}
						onCollapse={(c) => setCollapsed((m) => ({ ...m, [thread.n]: c }))}
						onHeight={(h) =>
							setHeights((m) =>
								m[thread.n] === h ? m : { ...m, [thread.n]: h },
							)
						}
						onDrag={(p) => setDragged((m) => ({ ...m, [thread.n]: p.top }))}
						onDrop={(p) => place(thread, p)}
						onReply={(text) => sendJson(REPLY, { thread: thread.n, text })}
					/>
				))}
				{draft && draftPos && (
					<Opener
						draft={draft}
						pos={draftPos}
						me={session.name}
						onCancel={() => setDraft(null)}
						onSend={async (text) => {
							const n = await sendJson(THREAD, {
								paper,
								page: draft.page,
								quote: draft.quote,
								rects: draft.rects,
								text,
							});
							if (n !== null) {
								setDraft(null);
								raise(n);
							}
						}}
					/>
				)}
			</div>
			{selected && !draft && (
				<button
					type="button"
					className="fixed z-50 flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background shadow-xl"
					style={{
						left: Math.min(
							innerWidth - 140,
							Math.max(8, selected.at.left + selected.at.width / 2 - 60),
						),
						top:
							selected.at.top > 110
								? selected.at.top - 40
								: selected.at.bottom + 8,
					}}
					onPointerDown={(event) => event.preventDefault()}
					onClick={() => {
						setDraft(selected);
						setSelected(null);
						getSelection()?.removeAllRanges();
					}}
				>
					<MessageSquare className="size-4" /> Discuss
				</button>
			)}
		</div>
	);
}

/** A floating card on the desk, dragged by its header. */
function Card({
	pos,
	width = BUBBLE,
	z,
	name,
	header,
	children,
	onRaise,
	onHeight,
	onDrag,
	onDrop,
	size,
	onSize,
}: {
	pos: Pos;
	width?: number;
	size?: Size | undefined;
	onSize?: (size: Size) => void;
	z: number;
	name: string;
	header: ReactNode;
	children?: ReactNode;
	onRaise?: () => void;
	onHeight?: (h: number) => void;
	onDrag?: (p: Pos) => void;
	onDrop?: (p: Pos) => void;
}) {
	const el = useRef<HTMLDivElement>(null);
	const resizing = useRef<{
		edge: string;
		x: number;
		y: number;
		from: Size & { h: number };
	} | null>(null);
	const drag = useRef<{
		x: number;
		y: number;
		from: Pos;
		moved: Pos | null;
	} | null>(null);
	useLayoutEffect(() => {
		const node = el.current;
		if (!node || !onHeight) return;
		const observer = new ResizeObserver(() => onHeight(node.offsetHeight));
		observer.observe(node);
		return () => observer.disconnect();
	}, [onHeight]);
	return (
		<div
			ref={el}
			data-bubble
			className="panel absolute flex flex-col overflow-hidden"
			style={{
				left: pos.left,
				top: pos.top,
				width,
				...(size?.h != null && { height: size.h }),
				zIndex: z,
				borderColor: color(name, 0.7),
			}}
			onPointerDownCapture={onRaise}
			onPointerEnter={onRaise}
		>
			<div
				className={`flex items-center gap-2 border-b px-3 py-2 select-none ${onDrag ? "cursor-ns-resize" : ""}`}
				style={{ touchAction: "none" }}
				onPointerDown={(event) => {
					if (!onDrag || (event.target as Element).closest("button")) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					drag.current = {
						x: event.clientX,
						y: event.clientY,
						from: pos,
						moved: null,
					};
				}}
				onPointerMove={(event) => {
					const d = drag.current;
					if (!d || !onDrag) return;
					const moved = {
						left: d.from.left,
						top: Math.max(0, d.from.top + event.clientY - d.y),
					};
					d.moved = moved;
					onDrag(moved);
				}}
				onPointerUp={() => {
					const d = drag.current;
					drag.current = null;
					if (d?.moved && onDrop) onDrop(d.moved);
				}}
			>
				{header}
			</div>
			{children}
			{size &&
				onSize &&
				EDGES.map(([edge, place]) => (
					<div
						key={edge}
						aria-hidden
						className={`absolute z-10 ${place}`}
						style={{ touchAction: "none" }}
						onPointerDown={(event) => {
							event.preventDefault();
							event.stopPropagation();
							event.currentTarget.setPointerCapture(event.pointerId);
							resizing.current = {
								edge,
								x: event.clientX,
								y: event.clientY,
								from: { ...size, h: size.h ?? el.current?.offsetHeight ?? 200 },
							};
						}}
						onPointerMove={(event) => {
							const r = resizing.current;
							if (!r) return;
							const dx = event.clientX - r.x;
							const dy = event.clientY - r.y;
							const next: Size = { ...r.from, h: size.h };
							const room = BUBBLE - MIN_W;
							if (r.edge.includes("l"))
								next.l = Math.max(-room - r.from.r, r.from.l - dx);
							if (r.edge.includes("r"))
								next.r = Math.max(-room - r.from.l, r.from.r + dx);
							if (r.edge.includes("b")) next.h = Math.max(MIN_H, r.from.h + dy);
							onSize(next);
						}}
						onPointerUp={() => {
							resizing.current = null;
						}}
						onDoubleClick={() => onSize(NATURAL)}
					/>
				))}
		</div>
	);
}

/** Where a card can be resized from: either side, the bottom, and both
 * bottom corners. A double click puts it back to its natural size. */
const EDGES = [
	["l", "inset-y-0 -left-1 w-2 cursor-ew-resize"],
	["r", "inset-y-0 -right-1 w-2 cursor-ew-resize"],
	["b", "inset-x-0 -bottom-1 h-2 cursor-ns-resize"],
	["bl", "-bottom-1 -left-1 size-4 cursor-nesw-resize"],
	["br", "-right-1 -bottom-1 size-4 cursor-nwse-resize"],
] as const;

function Avatar({ name }: { name: string }) {
	return (
		<span
			className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-black"
			style={{ background: color(name) }}
		>
			{name.slice(0, 2).toUpperCase()}
		</span>
	);
}

function Quote({ text, name }: { text: string; name: string }) {
	return (
		<p
			className="line-clamp-2 border-l-2 pl-2 font-serif text-xs text-muted-foreground italic"
			style={{ borderColor: color(name) }}
		>
			{text}
		</p>
	);
}

function Composer({
	placeholder,
	autoFocus = false,
	onSend,
	onCancel,
}: {
	placeholder: string;
	autoFocus?: boolean;
	onSend: (text: string) => Promise<unknown>;
	onCancel?: () => void;
}) {
	const [text, setText] = useState("");
	const submit = async () => {
		const t = text.trim();
		if (!t) return;
		setText("");
		await onSend(t);
	};
	return (
		<form
			className="flex items-end gap-2 border-t p-2"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<textarea
				// biome-ignore lint/a11y/noAutofocus: a bubble just opened to write in
				autoFocus={autoFocus}
				rows={1}
				value={text}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						void submit();
					} else if (event.key === "Escape") onCancel?.();
				}}
				placeholder={placeholder}
				className="field-sizing-content max-h-32 min-h-8 flex-1 resize-none rounded-md bg-muted px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
			/>
			<Button type="submit" size="sm" disabled={!text.trim()}>
				Send
			</Button>
		</form>
	);
}

/** A thread's bubble: the passage, the discussion, and a reply box. */
function Bubble({
	thread,
	pos,
	width,
	size,
	onSize,
	z,
	collapsed,
	seenBy,
	me,
	onRaise,
	onCollapse,
	onHeight,
	onDrag,
	onDrop,
	onReply,
}: {
	thread: Thread;
	pos: Pos;
	width: number;
	size: Size;
	onSize: (size: Size) => void;
	z: number;
	collapsed: boolean;
	seenBy: string[];
	me: string;
	onRaise: () => void;
	onCollapse: (c: boolean) => void;
	onHeight: (h: number) => void;
	onDrag: (p: Pos) => void;
	onDrop: (p: Pos) => void;
	onReply: (text: string) => Promise<unknown>;
}) {
	const people = [...new Set(thread.messages.map((m) => m.from))];
	const list = useRef<HTMLOListElement>(null);
	const count = thread.messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: on every new message
	useEffect(() => {
		list.current?.scrollTo({ top: list.current.scrollHeight });
	}, [count, collapsed]);
	return (
		<Card
			pos={pos}
			width={width}
			size={collapsed ? undefined : size}
			onSize={onSize}
			z={z}
			name={thread.from}
			onRaise={onRaise}
			onHeight={onHeight}
			onDrag={onDrag}
			onDrop={onDrop}
			header={
				<>
					<div className="flex -space-x-1">
						{people.slice(0, 4).map((p) => (
							<Avatar key={p} name={p} />
						))}
					</div>
					<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
						p. {thread.page} · {count} {count === 1 ? "message" : "messages"}
					</span>
					{(size.l !== 0 || size.r !== 0 || size.h !== null) && (
						<button
							type="button"
							aria-label="Reset size"
							title="Reset size"
							className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
							onClick={() => onSize(NATURAL)}
						>
							<RotateCcw className="size-3.5" />
						</button>
					)}
					<button
						type="button"
						aria-label={collapsed ? "Open" : "Fold"}
						className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
						onClick={() => onCollapse(!collapsed)}
					>
						{collapsed ? (
							<ChevronDown className="size-4" />
						) : (
							<ChevronUp className="size-4" />
						)}
					</button>
				</>
			}
		>
			{!collapsed && (
				<>
					<div className="px-3 pt-2">
						<Quote text={thread.quote} name={thread.from} />
					</div>
					<ol
						ref={list}
						className={`flex flex-col gap-2.5 overflow-y-auto px-3 py-2 ${size.h === null ? "max-h-80" : "min-h-0 flex-1"}`}
					>
						{thread.messages.map((m) => (
							<li key={m.n} className="flex gap-2">
								<Avatar name={m.from} />
								<div className="min-w-0 flex-1">
									<span
										className="text-xs font-medium"
										style={{ color: color(m.from) }}
									>
										{m.from === me ? "you" : m.from}
									</span>
									<Md>{m.text}</Md>
								</div>
							</li>
						))}
					</ol>
					{seenBy.length > 0 && (
						<span className="px-3 pb-1 text-[11px] text-muted-foreground">
							seen by {seenBy.join(", ")}
						</span>
					)}
					<Composer placeholder="Reply…" onSend={onReply} />
				</>
			)}
		</Card>
	);
}

/** The bubble for a passage just marked, before its thread is sent. */
function Opener({
	draft,
	pos,
	me,
	onSend,
	onCancel,
}: {
	draft: Selected;
	pos: Pos;
	me: string;
	onSend: (text: string) => Promise<unknown>;
	onCancel: () => void;
}) {
	return (
		<Card
			pos={pos}
			z={1000}
			name={me}
			header={
				<>
					<Avatar name={me} />
					<span className="flex-1 text-xs text-muted-foreground">
						New thread · p. {draft.page}
					</span>
					<button
						type="button"
						aria-label="Cancel"
						className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
						onClick={onCancel}
					>
						<X className="size-4" />
					</button>
				</>
			}
		>
			<div className="px-3 py-2">
				<Quote text={draft.quote} name={me} />
			</div>
			<Composer
				autoFocus
				placeholder="What about it? Markdown and $math$ work."
				onSend={onSend}
				onCancel={onCancel}
			/>
		</Card>
	);
}

/** The chat beside the paper, for what is about no passage in particular. */
function Chat({
	entries,
	session,
	send,
	onClose,
}: {
	entries: Entry[];
	session: Session;
	send: (body: string, options: { type: string }) => Promise<number | null>;
	onClose: () => void;
}) {
	const list = useRef<HTMLOListElement>(null);
	const last = entries.at(-1)?.n;
	// biome-ignore lint/correctness/useExhaustiveDependencies: on every new entry
	useEffect(() => {
		list.current?.scrollTo({ top: list.current.scrollHeight });
	}, [last]);
	return (
		<aside className="panel absolute top-3 right-3 bottom-3 z-40 flex w-[340px] max-w-[calc(100%-24px)] flex-col overflow-hidden">
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<span className="flex-1 text-sm font-medium">Chat</span>
				<button
					type="button"
					aria-label="Close the chat"
					className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					onClick={onClose}
				>
					<X className="size-4" />
				</button>
			</div>
			<ol
				ref={list}
				className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3"
			>
				{entries.length === 0 && (
					<li className="text-sm text-muted-foreground">
						For what is about no passage in particular.
					</li>
				)}
				{entries.map((entry) =>
					entry.type === JOIN || entry.type === LEAVE ? (
						<li
							key={entry.n}
							className="self-center text-xs text-muted-foreground"
						>
							{entry.from} {entry.type === JOIN ? "joined" : "left"}
						</li>
					) : (
						<li key={entry.n} className="flex gap-2">
							<Avatar name={entry.from} />
							<div className="min-w-0 flex-1">
								<span
									className="text-xs font-medium"
									style={{ color: color(entry.from) }}
								>
									{entry.from === session.name ? "you" : entry.from}
								</span>
								{base(entry.type) === "text/markdown" ? (
									<Md>{entry.text ?? ""}</Md>
								) : (
									<p className="text-sm whitespace-pre-wrap break-words">
										{entry.text}
									</p>
								)}
							</div>
						</li>
					),
				)}
			</ol>
			<Composer
				placeholder="Say something to everyone"
				onSend={(text) => send(text, { type: "text/markdown; charset=utf-8" })}
			/>
		</aside>
	);
}
