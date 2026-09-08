# Phase 9A — Smoke Test Post Prerequisite

## Post Architecture

A Post in this application is an **exam tag**, not a typed exam paper and not a parent of Subject.

- Model: `backend/src/models/Post.js`
- There is **no** `type`, `category`, `kind`, `year`, or `subjectId` field.
- Subjects are **global**. Deprecated `subject.postId` is unused on live data (0 subjects carry it).
- Questions attach to exams only through `Question.postIds[]`.
- `questionService.create()` treats any existing Post `_id` as a valid exam tag (`assertPostIds` → `postRepository.existsAllIds`). It does not check Post type (none exists) and does not require the Post to be linked to a Subject.

Live catalog before this phase: 11 subjects, 48 topics, **0 posts**, 250 SET A questions, 0 tests.

## Required Fields

Schema (`Post`):

| Field | Required | Notes |
|---|---|---|
| `name` | yes | trimmed string; unique case-insensitive index |
| `slug` | yes | unique, lowercase; **derived from `name` if omitted** |
| `description` | no | default `''` |
| `isActive` | no | default `true` (schema); Admin list is active-only |
| `createdAt` / `updatedAt` | auto | timestamps |
| year / type / subject | **not on schema** | do not send |

HTTP validators (`createPostValidators`) used by Admin `POST /api/posts`:

- `name`: required, 2–100 characters
- `slug`: optional; if present, kebab-case `[a-z0-9]+(?:-[a-z0-9]+)*`
- `description`: optional, max 500 characters

Service (`postService.create`) additionally:

- rejects empty name
- slugifies name when slug omitted
- 409 on duplicate name or slug

**Subject relationship:** none. A Post must **not** be attached to a Subject. Do not create a Subject for this tag.

**Status:** `isActive: true` by default. That is the Admin/public list filter. `existsAllIds` used at question create only checks that the `_id` exists.

**“Exam classification”:** every Post document **is** an exam. There is no extra metadata required for `questionService.create()` to accept it in `postIds`.

## Creation Path

Normal Admin path:

1. Admin UI `ManageTopics.jsx` → `createPost({ name, description })`
2. `POST /api/posts` (admin JWT) → `createPostValidators` → `postController.createPost`
3. `postService.create({ name, slug, description })`
4. `postRepository.create` → `Post.create({ name, slug, description })`  
   (`isActive` comes from the schema default)

This phase used **step 3–4 only** (`postService.create`), same service the controller calls. `mongoose.connect({ autoIndex: false })`. No `Model.create` from the script, no raw insert, no importer, no index sync.

Helper (one-shot): `backend/scripts/create-phase9a-smoke-post.mjs`

Pre-create marker query: **0** Posts contained `PHASE9_SMOKE_TEST_2026`.

## Created Post

| Field | Value |
|---|---|
| `_id` | `6a9fe271a6683cc1b21ccded` |
| `name` | `PHASE9_SMOKE_TEST_2026 — JKSSB Structured Question Test` |
| `slug` | `phase9-smoke-test-2026-jkssb-structured-question-test` (derived) |
| `description` | Smoke-test exam tag for Phase 9 structured-question flow. Not a real JKSSB post. |
| `isActive` | `true` |
| year | not present (not on schema) |
| type/category | not present |
| subjectId | not present |

Read-back: **exactly one** Post in `ssbfy`. Marker present. Valid ObjectId. Active. Required `name` + `slug` populated.

ID snapshot (local, not Mongo): `backend/scripts/fixtures/set-a/PHASE9_smoke_post.json`

This Post is a legitimate exam tag for a future `questionService.create({ postIds: ['6a9fe271a6683cc1b21ccded'] })`. Questions and Tests were **not** created in this phase.

## SET A Integrity

Before and after Post create (question `_id` list and `updatedAt` snapshots compared):

| Check | Value |
|---|---|
| SET A questions | 250 |
| plain | 49 |
| two_statements | 8 |
| numbered_list | 179 |
| table | 14 |
| SET A questions modified | 0 |
| SET A Tests | 0 |
| `PHASE9_SMOKE_TEST_2026` questions | 0 |
| `PHASE9_SMOKE_TEST_2026` tests | 0 |

Subjects 11 / topics 48 — unchanged. No Subject/Topic documents written.

## Database Changes

| Collection | Before | After |
|---|---|---|
| posts | 0 | 1 |
| questions | 250 | 250 |
| tests | 0 | 0 |
| subjects | 11 | 11 |
| topics | 48 | 48 |

Posts created: 1  
Questions created: 0  
Questions modified: 0  
Questions deleted: 0  
Tests created: 0  
Tests modified: 0  
Tests deleted: 0  

Unexpected MongoDB writes: 0  
`syncIndexes()`: not run  
Migrations: none  
Schema changes: none  

## Final Verdict

**PASS**

One legitimate smoke-test exam Post exists. Phase 9 question/Test creation was **not** started. Waiting for explicit approval for the next step.
