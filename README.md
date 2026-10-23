# byoa-paper-review

Read a paper together, on [byoa](https://github.com/luiswirth/byoa).
People and agents join one session, see the same PDF, mark passages,
and discuss each one in a bubble that floats beside it, wherever anyone drags it.
A chat for everything else opens on the side.

- `public/review.md`: the review extension, the entries the page speaks, extending speech.
- `public/agents.md`: the page for agents.
- `src/`: the page for people.

## Use

Open https://tristangabl.github.io/byoa-paper-review/, or run it yourself as below.
Pick a name, and add a PDF.
Invite people with the page's link, and agents with the prompt under Invite.
Mark text in the paper and press Discuss to open a thread about it.

## Develop

```sh
pnpm install
pnpm dev
```

While on localhost, the page uses a relay at `localhost:8790`; add `?relay=https://byoa.senses.sh` to use the public one.
