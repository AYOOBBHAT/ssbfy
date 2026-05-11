# Global subjects — strategy and rollout

## Target model

- **Subject**: global catalog entry; `postId` is optional and **deprecated** (kept for backward compatibility, not required for new rows).
- **Topic**: belongs only to `subjectId`; uniqueness is `(subjectId, name)` with case-insensitive collation where defined in the schema.
- **Question**: belongs to `subjectId` + `topicId`; **post tagging** is `postIds[]` (optional filter layer, not ownership).
- **Post**: optional categorization for questions and UX filters, not the owner of the subject tree.

## Deploy order

1. Deploy backend + admin that tolerate **global** subjects (`postId` null) and global name uniqueness **after** data is merged, or deploy code that does not sync the strict unique index until migration completes (project uses `Subject.syncIndexes()` at runtime — if startup fails on duplicate names, run migration or temporarily relax indexes in ops).
2. Run `npm run migrate:global-subjects` (dry-run), review output.
3. Run `npm run migrate:global-subjects -- --apply` from `backend/` when satisfied.
4. Run `npm run audit:questions && npm run audit:topics && npm run audit:tests`.

## Migration script

- **File**: `scripts/migrate-global-subjects.mjs`
- **npm**: `npm run migrate:global-subjects` (dry-run); add `--apply` for writes; `--verbose` for per-id detail.
- **Behavior**: groups subjects by normalized name; picks canonical (active → most references → oldest); remaps Topic, Question, Note `subjectId`; sets winner `postId` to `null`; deletes merged subject documents; skips groups where loser topic names collide with winner topic names (manual fix required).

## APIs and repositories

- **List subjects** with `?postId=` returns **global** subjects (`postId` null/absent) **and** legacy subjects tied to that post (`$or` in `subjectRepository.findAll`).
- **Create subject**: name required; `postId` optional (validators + `subjectService`).
- **Questions**: `reconcilePostIds` requires non-empty `postIds` when the subject has no legacy `postId`; admin **Add Question** sends `postIds: [selectedPostId]` on create.

## Admin UX

- **ManageTopics**: loads all subjects; post selector **filters** the visible list; **Create Subject** creates a **global** subject (no `postId`).
- **AddQuestion** / **CreateTest** / **ManageQuestions** / **ManageNotes**: subject pickers include globals and legacy subjects for the selected exam (`!postId || postId === filter`).

## Backward compatibility

- Old subjects with `postId` set remain valid; `findAll` with `postId` still returns them alongside globals.
- Do **not** remove `Subject.postId` from the schema until a later cleanup phase.

## Remaining technical debt

- Manual resolution for migration **skipped** groups (duplicate topic names under two subjects being merged).
- Multi-select `postIds` in admin Add Question (currently one exam drives default tags).
- Optional removal of deprecated `postId` on Subject after a stabilization period and full audit.
