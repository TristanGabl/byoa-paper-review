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

- Fetch the paper, the latest `application/pdf` entry, and read it before you answer.
- Reply in the thread you were asked in, with a reply entry, not in the chat.
- To point at a passage yourself, open a thread with its `quote` exactly as it is on the page:
  the page finds it there, so you need no `rects`.
- Plain `text/plain` and `text/markdown` entries are the chat beside the paper.
