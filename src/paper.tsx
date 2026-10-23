// The PDF: loaded from its entry, laid out as one column of pages, each
// drawn once it scrolls near, with pdf.js's text layer to mark passages in.

import type { PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { useEffect, useRef, useState } from "react";
import type { Rect } from "./review.ts";
import "pdfjs-dist/web/pdf_viewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = worker;

export type Doc = {
	pdf: PDFDocumentProxy;
	/** Each page's height over its width. */
	ratios: number[];
};

/** Opens the PDF that `load` fetches. */
export function useDoc(
	load: (() => Promise<ArrayBuffer>) | null,
	key: unknown,
) {
	const [doc, setDoc] = useState<Doc | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` names the paper
	useEffect(() => {
		setDoc(null);
		setProblem(null);
		if (!load) return;
		let gone = false;
		let opened: PDFDocumentProxy | null = null;
		(async () => {
			const pdf = await pdfjs.getDocument({ data: await load() }).promise;
			opened = pdf;
			const ratios: number[] = [];
			for (let i = 1; i <= pdf.numPages; i++) {
				const viewport = (await pdf.getPage(i)).getViewport({ scale: 1 });
				ratios.push(viewport.height / viewport.width);
			}
			if (gone) return void pdf.destroy();
			setDoc({ pdf, ratios });
		})().catch((error: Error) => !gone && setProblem(error.message));
		return () => {
			gone = true;
			void opened?.destroy();
		};
	}, [key]);
	return { doc, problem };
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Where `quote` is on page `page`, found in its text, for threads that came
 * without rects, such as an agent's. */
export async function findQuote(
	doc: Doc,
	page: number,
	quote: string,
): Promise<Rect[]> {
	const proxy = await doc.pdf.getPage(page);
	const viewport = proxy.getViewport({ scale: 1 });
	const items = (await proxy.getTextContent()).items.filter(
		(item): item is TextItem => "str" in item,
	);
	// The page's text with its whitespace collapsed, and which item each of
	// its characters came from.
	let text = "";
	const owner: number[] = [];
	items.forEach((item, i) => {
		for (const c of item.str + (item.hasEOL ? " " : "")) {
			const blank = /\s/.test(c);
			if (blank && (text === "" || text.endsWith(" "))) continue;
			text += blank ? " " : c.toLowerCase();
			owner.push(i);
		}
	});
	const wanted = norm(quote);
	const at = wanted ? text.indexOf(wanted) : -1;
	if (at < 0) return [];
	const hit = new Set(owner.slice(at, at + wanted.length));
	const rects: Rect[] = [];
	items.forEach((item, i) => {
		if (!hit.has(i) || !item.str.trim()) return;
		const [, , , , e, f] = item.transform as number[];
		const [x0, y0, x1, y1] = viewport.convertToViewportRectangle([
			e ?? 0,
			f ?? 0,
			(e ?? 0) + item.width,
			(f ?? 0) + item.height,
		]);
		const left = Math.min(x0, x1);
		const top = Math.min(y0, y1);
		rects.push([
			left / viewport.width,
			top / viewport.height,
			Math.abs(x1 - x0) / viewport.width,
			Math.abs(y1 - y0) / viewport.height,
		]);
	});
	return rects;
}

/** Page `n`, `width` pixels wide, drawn once it comes near the view. */
export function Page({
	doc,
	n,
	width,
}: {
	doc: Doc;
	n: number;
	width: number;
}) {
	const box = useRef<HTMLDivElement>(null);
	const [near, setNear] = useState(false);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([seen]) => seen?.isIntersecting && setNear(true),
			{ rootMargin: "1200px 0px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const el = box.current;
		if (!near || !el) return;
		let gone = false;
		const tasks: { cancel(): void }[] = [];
		(async () => {
			const page = await doc.pdf.getPage(n);
			if (gone) return;
			const viewport = page.getViewport({
				scale: width / page.getViewport({ scale: 1 }).width,
			});
			const dpr = Math.min(devicePixelRatio || 1, 2.5);
			const canvas = document.createElement("canvas");
			canvas.width = Math.floor(viewport.width * dpr);
			canvas.height = Math.floor(viewport.height * dpr);
			canvas.className = "absolute inset-0 size-full";
			const layer = document.createElement("div");
			layer.className = "textLayer";
			layer.style.setProperty("--scale-factor", String(viewport.scale));
			layer.style.setProperty("--user-unit", "1");
			el.replaceChildren(canvas, layer);
			const render = page.render({
				canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D,
				viewport,
				...(dpr !== 1 && { transform: [dpr, 0, 0, dpr, 0, 0] }),
			});
			tasks.push(render);
			await render.promise;
			if (gone) return;
			const text = new pdfjs.TextLayer({
				textContentSource: page.streamTextContent(),
				container: layer,
				viewport,
			});
			tasks.push(text);
			await text.render();
		})().catch(() => {});
		return () => {
			gone = true;
			for (const task of tasks) task.cancel();
		};
	}, [near, doc, n, width]);

	return <div ref={box} className="absolute inset-0" />;
}
