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

- **ManageTopics**: global subject catalog; posts are not required to manage subjects/topics.
- **AddQuestion** / **CreateTest** / **ManageQuestions** / **ManageNotes**: subjects are global; optional post/exam controls **filter content** (questions, notes, tests), not subject existence.

## Backward compatibility

- Old subjects with `postId` set remain valid; `findAll` with `postId` still returns them alongside globals.
- Do **not** remove `Subject.postId` from the schema until a later cleanup phase.

## Remaining technical debt

- Manual resolution for migration **skipped** groups (duplicate topic names under two subjects being merged).
- Optional removal of deprecated `postId` on Subject after a stabilization period and full audit.

---

## Legacy compatibility layer (not the normalized hierarchy)

These paths exist **only** so old rows, old clients, and migration-era data keep working. They are **not** “Post owns Subject” rules at runtime.

| Area | What is tolerated | Canonical field / behavior | Safe removal (high level) |
|------|-------------------|----------------------------|---------------------------|
| `Subject.postId` | Optional deprecated link on some old subjects | Global subjects; exams tagged on `Question.postIds[]` / `Note.postIds[]` | After DB audit shows `postId` unused or null everywhere you care about, and imports/UI always send explicit tags |
| `subjectRepository.findAll({ postId })` | API **narrowing**: globals + legacy subjects for that post | Same list semantics without implying ownership | When no client relies on `?postId=` for subject lists (or behavior is replicated elsewhere) |
| `questionService.reconcilePostIds` | Ensures legacy `subject.postId` appears inside `postIds` when still set | Caller-supplied `postIds[]` for global subjects | When no subject has `postId` set, or policy changes to never auto-inject |
| `noteService` list filter | `postId` query matches `note.postId` **or** `note.postIds` | `postIds[]` for tags; optional legacy `postId` on documents | When all notes migrated and queries use only tag semantics you define |
| CSV `questionImportService` | Requires subject with `postId` for import rows; derives `postIds: [subject.postId]` | Future: explicit post/exam column or IDs in CSV | When import template and ops are updated; **risky** to drop before that |
| `topicService.create` | Verifies referenced `subject.postId` still points at an existing Post (if set) | Topic ownership is `subjectId` only | When no subject carries a stale `postId`, or check is replaced with a one-off audit job |

**TODO markers** in code point to the same conditions. Do **not** treat compatibility shims as architecture to copy into new features.
