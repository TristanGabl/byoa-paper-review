/** byoa-web's welcome page, kept here until it takes the page for agents'
 * address: byoa-web's builds it from the origin alone, which misses a site
 * served under a path, as on GitHub Pages. */

import { type ReactNode, useState } from "react";

/** This site's address, with a trailing slash, as Vite serves it. */
export const site = new URL(import.meta.env.BASE_URL, location.origin).href;

export type OnboardProps = {
	/** The service, as the person knows it. */
	name: string;
	/** What the person gets, in a few words. */
	title: string;
	/** One or two sentences on it. */
	description: string;
	/** The session's token, offered on its own and in the prompt. */
	token: string;
	/** What the person should know before. */
	note?: ReactNode;
};

const STEPS = [
	["Copy", "the prompt above."],
	["Paste", "it into your agent, such as Claude Code."],
	["Open", "the link your agent gives you. It sets up everything else."],
] as const;

/** The look every page of a person's onboarding shares. */
function Frame({
	name,
	title,
	description,
	children,
}: {
	name: string;
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(60rem 30rem at 50% -10%, var(--onboard-glow, oklch(0.6 0.17 265 / 0.22)), transparent 70%)",
				}}
			/>
			<div className="relative flex w-full max-w-xl flex-col gap-10">
				<header className="flex flex-col gap-4">
					<span className="font-mono text-sm text-muted-foreground">
						{name}
					</span>
					<h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
						{title}
					</h1>
					<p className="text-lg text-pretty text-muted-foreground">
						{description}
					</p>
				</header>
				{children}
				<footer className="text-xs text-muted-foreground">
					<a
						className="underline-offset-4 hover:text-foreground hover:underline"
						href="https://byoa.senses.sh"
					>
						byoa
					</a>
					: bring your own agent
				</footer>
			</div>
		</div>
	);
}

export function Onboard({
	name,
	title,
	description,
	token,
	note,
}: OnboardProps) {
	const prompt = `Read ${site}agents.md and join with session token ${token}`;
	return (
		<Frame name={name} title={title} description={description}>
			<section className="flex flex-col gap-2 rounded-2xl border bg-card/60 p-2 shadow-2xl shadow-black/20 backdrop-blur">
				<span className="px-2 pt-1 text-xs font-medium text-muted-foreground">
					Give your agent this
				</span>
				<pre className="rounded-xl bg-background/80 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
					{prompt}
				</pre>
				<Copy text={prompt} label="Copy the prompt" primary />
			</section>
			<section className="flex flex-col gap-2 rounded-2xl border bg-card/40 p-2 sm:flex-row sm:items-center">
				<div className="flex min-w-0 flex-1 flex-col px-2 py-1">
					<span className="text-xs font-medium text-muted-foreground">
						Session token
					</span>
					<code className="truncate font-mono text-sm">{token}</code>
				</div>
				<Copy text={token} label="Copy the token" />
			</section>
			<ol className="grid gap-5 sm:grid-cols-3">
				{STEPS.map(([verb, rest], i) => (
					<li key={verb} className="flex gap-3 text-sm sm:flex-col sm:gap-2">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs text-muted-foreground">
							{i + 1}
						</span>
						<span className="text-muted-foreground">
							<span className="font-medium text-foreground">{verb}</span> {rest}
						</span>
					</li>
				))}
			</ol>
			{note && <p className="text-sm text-muted-foreground">{note}</p>}
		</Frame>
	);
}

function Copy({
	text,
	label,
	primary = false,
}: {
	text: string;
	label: string;
	primary?: boolean;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className={`flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px ${primary ? "bg-primary text-primary-foreground hover:bg-primary/85" : "border bg-background/80 hover:bg-muted"}`}
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				className="size-4"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				{copied ? (
					<path d="M20 6 9 17l-5-5" />
				) : (
					<>
						<rect width="14" height="14" x="8" y="8" rx="2" />
						<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
					</>
				)}
			</svg>
			{copied ? "Copied" : label}
		</button>
	);
}
