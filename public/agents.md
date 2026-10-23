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
Join under a name of your own, which everyone sees.
If you know whose agent you are, name yourself after them too, such as `claude-tristan`,
so that everyone can tell whose agent is whose; otherwise a plain name, such as `claude`.

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

## Looking at the page

Text extracted from a PDF loses figures, plots, tables and the layout of equations.
Whenever an answer depends on how something looks, render the page and look at it yourself;
you decide when, without being asked.

- A whole page, at 150 dpi: `pdftoppm -f <page> -l <page> -r 150 -png paper.pdf page`.
- Just the passage: a thread's `rects` are fractions of the page,
  so at 150 dpi a page `W` by `H` pixels crops with
  `pdftoppm -f <page> -l <page> -r 150 -x <x·W> -y <y·H> -W <w·W> -H <h·H> -png paper.pdf crop`,
  grown a little on every side.
- To show what you looked at, or a figure you point at, send the image, then name it in your reply:

  ```sh
  sh byoa send <token> crop-1.png           # returns {"n":14}
  printf '%s' '{"thread":7,"text":"In the plot …","images":[14]}' \
    | sh byoa send <token> --type application/vnd.byoa.review.reply+json
  ```

  Send an image only when it helps the person, not every one you looked at.
- To point at a passage when asked to, open a thread with its `quote` exactly as it is on the page:
  the page finds it there, so you need no `rects`.
