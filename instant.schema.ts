import { i } from '@instantdb/admin';

/**
 * TaskChaser's InstantDB schema.
 *
 * The app runs fine without this: Instant accepts writes to undeclared
 * namespaces. Pushing it buys two things that matter here.
 *
 *   1. Indexes on the fields every request filters by. Without them, looking a
 *      task up by its `responseToken` (which happens on every tap of an email
 *      link) scans rather than seeks.
 *   2. A uniqueness guarantee on `owners.email`, so two simultaneous sign-ins
 *      with the same address cannot create two workspaces for one person.
 *
 * Push it with:  npx instant-cli@latest push schema
 *
 * `owners` rather than `users` keeps it clearly apart from Instant's own
 * `$users` namespace, which belongs to Instant's auth and is unrelated to the
 * identity-only sign-in this app uses.
 */
const _schema = i.schema({
  entities: {
    owners: i.entity({
      fullName: i.string(),
      title: i.string(),
      email: i.string().unique().indexed(),
      createdAt: i.string(),
    }),

    members: i.entity({
      ownerId: i.string().indexed(),
      name: i.string(),
      email: i.string().indexed(),
      role: i.string(),
      createdAt: i.string().indexed(),
    }),

    tasks: i.entity({
      ownerId: i.string().indexed(),
      title: i.string(),
      notes: i.string(),
      dueAt: i.string().optional(),
      priority: i.string(),
      assigneeId: i.string().optional().indexed(),
      status: i.string().indexed(),
      // The unguessable token in the three email links.
      responseToken: i.string().unique().indexed(),
      notifiedAt: i.string().optional(),
      respondedAt: i.string().optional(),
      responseNote: i.string(),
      createdAt: i.string().indexed(),
      updatedAt: i.string(),
      completedAt: i.string().optional(),
    }),

    events: i.entity({
      ownerId: i.string().indexed(),
      taskId: i.string().optional().indexed(),
      type: i.string(),
      message: i.string(),
      actor: i.string(),
      createdAt: i.string().indexed(),
    }),
  },
});

type _AppSchema = typeof _schema;
export type AppSchema = _AppSchema;
export default _schema;
