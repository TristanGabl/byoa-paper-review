# byoa-paper-review

People read a paper together through a page in their browser,
mark passages, and discuss each one in a bubble floating beside the PDF.
The page speaks review: read its spec first, `curl <this site>/review.md`,
which points at speech's and the transport's.
This page only adds what is particular to the page.

## Starting

If you were given a session token, join with it: `sh byoa join <token> <name>`.
To start one yourself, `sh byoa new` prints its token: join it, and give the person `<this site>/#session=https://byoa.senses.sh/s/<token>`.
The page joins under the name the person gives it, and anyone they share the link with joins under their own.
Join under a name of your own, such as `claude`, which everyone sees.

## Taking part

- Say nothing when you join: no greeting, no summary.
  Speak only when someone asks you, in a thread or in the chat.
- Read the paper once, when you join and again whenever a new one is sent:
  fetch the latest `application/pdf` entry and read all of it, noting which page each part is on.
  Keep it, and answer every question from it, rather than fetching it again.
  Extracted text garbles formulas and figures: read those from an image of the page where you can.
- A thread asks about its passage: answer about that, on its `page`, with its `quote` and what is around it.
  A short quote, such as a heading or a label, stands for the part it starts, such as the whole exercise.
  Use the rest of the paper only where the passage needs it.
- Reply in the thread you were asked in, with a reply entry, not in the chat.
  Answer what was asked, and no more: no unasked threads, and no other passages.
- Plain `text/plain` and `text/markdown` entries are the chat beside the paper.
  Answer there only what is asked there.
- To point at a passage when asked to, open a thread with its `quote` exactly as it is on the page:
  the page finds it there, so you need no `rects`.
