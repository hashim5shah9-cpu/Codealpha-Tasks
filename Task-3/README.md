# Keel

A collaborative project board. Create a shared project, move task cards across columns, assign them, and keep the conversation on the card. Updates and notifications arrive live over WebSockets.

## What you can do

- Register and sign in
- Create group projects and invite teammates by email
- Boards with columns and draggable task cards
- Assign a person, set priority and a due date, and comment on a card
- Notifications when you are invited, assigned, or mentioned in a comment thread
- Live board updates for everyone looking at the same project

## Stack

- Browser client served by the same Node process
- Node HTTP API and WebSockets for live board updates and notifications
- SQLite for users, projects, tasks, comments, and notifications
- Signed token authentication

## Demo accounts

Password for each account is `keel123`.

- `hashim@keel.app`
- `amira@keel.app`
- `leo@keel.app`

Hashim and Amira already share two projects, so you can sign in as each of them in two browsers and watch a comment or a card move land on the other screen.

## Run it

Requires Node.js 22 or newer. No install step.

```bash
node server/src/index.js
```

Open http://localhost:4000.
