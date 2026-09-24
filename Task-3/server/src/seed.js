import crypto from "crypto";
import { get, run, transaction } from "./db.js";
import { hashPassword } from "./routes.js";

const PASSWORD = "keel123";

export function seedIfEmpty() {
  const existing = get("SELECT COUNT(*) AS count FROM users");
  if (existing.count > 0) return;

  const hash = hashPassword(PASSWORD);
  const now = new Date().toISOString();
  const people = [
    { id: crypto.randomUUID(), name: "Hashim Shah", email: "hashim@keel.app", color: "#c4542c" },
    { id: crypto.randomUUID(), name: "Amira Noor", email: "amira@keel.app", color: "#2f5d4a" },
    { id: crypto.randomUUID(), name: "Leo Park", email: "leo@keel.app", color: "#3d5a80" },
  ];

  const launchId = crypto.randomUUID();
  const studioId = crypto.randomUUID();
  const columns = {
    backlog: crypto.randomUUID(),
    progress: crypto.randomUUID(),
    review: crypto.randomUUID(),
    done: crypto.randomUUID(),
    ideas: crypto.randomUUID(),
    making: crypto.randomUUID(),
  };

  const tasks = [
    {
      id: crypto.randomUUID(),
      project: launchId,
      column: columns.progress,
      title: "Write the launch announcement",
      description: "Short note for the product list and a longer post for the site. Keep the tone direct.",
      assignee: people[1].id,
      creator: people[0].id,
      priority: "high",
      due: daysFromNow(2),
      position: 0,
    },
    {
      id: crypto.randomUUID(),
      project: launchId,
      column: columns.backlog,
      title: "Collect screenshots for the gallery",
      description: "Board view, task drawer, and the notification bell. Crop to the content, no browser chrome.",
      assignee: people[2].id,
      creator: people[0].id,
      priority: "medium",
      due: daysFromNow(5),
      position: 0,
    },
    {
      id: crypto.randomUUID(),
      project: launchId,
      column: columns.backlog,
      title: "Confirm invite emails with the team",
      description: "Everyone joining the launch project should already have a Keel account.",
      assignee: null,
      creator: people[1].id,
      priority: "low",
      due: null,
      position: 1,
    },
    {
      id: crypto.randomUUID(),
      project: launchId,
      column: columns.review,
      title: "Review pricing copy",
      description: "Check the three tiers against what we actually ship this week.",
      assignee: people[0].id,
      creator: people[2].id,
      priority: "urgent",
      due: daysFromNow(1),
      position: 0,
    },
    {
      id: crypto.randomUUID(),
      project: launchId,
      column: columns.done,
      title: "Reserve the launch domain",
      description: "Domain is pointed at the staging host.",
      assignee: people[2].id,
      creator: people[0].id,
      priority: "medium",
      due: daysFromNow(-3),
      position: 0,
    },
    {
      id: crypto.randomUUID(),
      project: studioId,
      column: columns.ideas,
      title: "Pick a type pair for the marketing site",
      description: "Something with a serif headline and a plain sans for UI.",
      assignee: people[0].id,
      creator: people[1].id,
      priority: "medium",
      due: daysFromNow(8),
      position: 0,
    },
  ];

  transaction(() => {
    for (const person of people) {
      run(
        "INSERT INTO users (id, name, email, password_hash, color, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [person.id, person.name, person.email, hash, person.color, now]
      );
    }

    run(
      "INSERT INTO projects (id, name, description, color, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        launchId,
        "Launch week",
        "Everything that has to ship before Friday’s public launch.",
        "#c4542c",
        people[0].id,
        now,
      ]
    );
    run(
      "INSERT INTO projects (id, name, description, color, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        studioId,
        "Studio site",
        "A quieter board for the marketing site refresh.",
        "#2f5d4a",
        people[1].id,
        now,
      ]
    );

    for (const person of people) {
      run(
        "INSERT INTO members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
        [launchId, person.id, person.id === people[0].id ? "owner" : "member", now]
      );
    }
    run(
      "INSERT INTO members (project_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
      [studioId, people[1].id, now]
    );
    run(
      "INSERT INTO members (project_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
      [studioId, people[0].id, now]
    );

    const columnRows = [
      [columns.backlog, launchId, "Backlog", 0],
      [columns.progress, launchId, "In progress", 1],
      [columns.review, launchId, "Review", 2],
      [columns.done, launchId, "Done", 3],
      [columns.ideas, studioId, "Ideas", 0],
      [columns.making, studioId, "Making", 1],
    ];
    for (const row of columnRows) {
      run("INSERT INTO columns (id, project_id, name, position) VALUES (?, ?, ?, ?)", row);
    }

    for (const task of tasks) {
      run(
        `INSERT INTO tasks
          (id, project_id, column_id, title, description, assignee_id, creator_id, priority, due_date, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.project,
          task.column,
          task.title,
          task.description,
          task.assignee,
          task.creator,
          task.priority,
          task.due,
          task.position,
          now,
          now,
        ]
      );
    }

    run(
      "INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        tasks[0].id,
        people[0].id,
        "Lead with the board, then the comment thread. Skip the feature list.",
        now,
      ]
    );
    run(
      "INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        tasks[0].id,
        people[1].id,
        "Draft is in the doc. I’ll drop the final lines here once Leo checks the screenshots.",
        now,
      ]
    );
    run(
      "INSERT INTO comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        tasks[3].id,
        people[2].id,
        "The middle tier still says “unlimited projects”. We should match the real plan.",
        now,
      ]
    );
  });

  console.log("Seeded demo accounts (password: keel123)");
  console.log("  hashim@keel.app   Amira is a teammate, Leo too");
  console.log("  amira@keel.app");
  console.log("  leo@keel.app");
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
