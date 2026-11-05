/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  sourceAttachments,
  sourceSubmissions,
  sourceDigest,
  buildImportedEvent,
  verifyImportedEvent,
} = require("../application/airtable-migration.ts");
const { submissionForViewer } = require("../domain/finals-visibility.ts");
const { reviewedSubmission } = require("../domain/judge-history.ts");
function fixture() {
  return {
    config: {
      id: "event",
      slug: "night-hack",
      name: "Night Hack",
      baseId: "base",
      tableName: "Submissions",
      reviewsTableName: "Reviews",
      imageUrl: "",
      squareImageUrl: "",
      active: true,
      scoringPolicy: "raw-v1",
    },
    records: [
      {
        id: "project",
        createdTime: "2026-01-01T00:00:00Z",
        fields: {
          "Team Name": "Builders",
          "Name(s)": "Builder",
          Email: "private@example.com",
          Description: "Original text",
          "Demo Link Url": "https://example.com/demo",
          "Team Photo": [
            {
              id: "attPhoto",
              url: "https://v5.airtableusercontent.com/temporary-photo",
              filename: "photo.jpg",
              size: 5,
              type: "image/jpeg",
            },
          ],
          "Unknown field": "Must survive",
        },
      },
    ],
    reviews: [
      {
        id: "review",
        fields: {
          "Submission ID": "project",
          Phase: "preliminary",
          "Judge Name": "Judge",
          "Progress Score": 5,
          "Practicality Score": 4,
          "Technical Complexity Score": 3,
          "Total Score": 12,
          "Judge Notes": "Original private note",
          "Completed At": "2026-01-02T00:00:00Z",
        },
      },
    ],
    publication: null,
    registry: null,
    journal: [],
    relatedTables: [],
    schema: [],
    capturedAt: "2026-01-03T00:00:00Z",
  };
}
function assets(source) {
  return sourceAttachments(source).map((file) => ({
    id: file.assetId,
    eventId: source.config.id,
    bucket: "private",
    path: file.path,
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    sha256: "verified-checksum",
    sourceAttachmentId: file.id,
  }));
}
test("expired attachment URLs and capture time do not change source identity; record changes do", () => {
  const source = fixture(),
    changed = structuredClone(source);
  changed.capturedAt = "2027-01-01";
  changed.records[0].fields["Team Photo"][0].url = "https://v5.airtableusercontent.com/refreshed";
  assert.equal(sourceDigest(source), sourceDigest(changed));
  changed.records[0].fields.Description = "Changed";
  assert.notEqual(sourceDigest(source), sourceDigest(changed));
});
test("all fields, IDs, review notes and media references survive without fabricated scores", () => {
  const source = fixture();
  const imported = buildImportedEvent(source, assets(source));
  const report = verifyImportedEvent(source, imported);
  assert.equal(report.submissions, 1);
  assert.equal(report.preliminaryReviews, 1);
  const project = imported.submissions[0];
  assert.equal(project.id, "project");
  assert.equal(project.importedFields["Unknown field"], "Must survive");
  assert.equal(project.liveDemoUrl, "https://example.com/demo");
  assert.equal(project.reviews[0].notes, "Original private note");
  assert.match(project.teamPhotoUrl, /^\/api\/hackathons\/night-hack\/assets\//);
  assert.equal(project.files[0].filename, "photo.jpg");
  assert.equal(project.importedFields["Team Photo"][0].url, project.teamPhotoUrl);
  assert.equal(imported.config.settings.submissionsOpen, false);
});
test("missing or invalid media copies stop activation and orphan reviews stop import", () => {
  const source = fixture();
  assert.throws(() => buildImportedEvent(source, []), /Every source attachment/);
  const copies = assets(source);
  copies[0].size = 4;
  assert.throws(() => buildImportedEvent(source, copies), /Every source attachment/);
  source.reviews[0].fields["Submission ID"] = "missing";
  assert.throws(() => sourceSubmissions(source), /missing submission/);
});
test("changes to imported review history fail verification", () => {
  const source = fixture(),
    target = buildImportedEvent(source, assets(source));
  target.submissions[0].reviews[0].progressScore = 9;
  assert.throws(() => verifyImportedEvent(source, target), /reviews/);
});
test("legacy form labels map to native details without inventing review identities", () => {
  const source = fixture();
  source.reviews = [];
  source.records[0].fields = {
    "Team name": "Historical team",
    "Name(s)": "Builder",
    "submitted at": "2020-01-01T00:00:00Z",
    "Will u be here irl to demo": "Yes",
    "Total Judge Scores": 28,
    "Judge #1 score": 4,
    Github: "https://github.com/example/project",
  };
  const target = buildImportedEvent(source, []);
  assert.equal(target.submissions[0].teamName, "Historical team");
  assert.equal(target.submissions[0].attendance, "Yes");
  assert.equal(target.submissions[0].repositoryUrl, "https://github.com/example/project");
  assert.equal(target.submissions[0].reviews.length, 0);
  assert.equal(target.submissions[0].importedFields["Total Judge Scores"], 28);
});
test("raw imported private fields stay organizer-only, including judge history", () => {
  const source = fixture(),
    target = buildImportedEvent(source, assets(source)),
    project = target.submissions[0];
  assert.ok(submissionForViewer(project, true).importedFields);
  assert.equal(submissionForViewer(project, false).importedFields, undefined);
  assert.equal(submissionForViewer(project, false).contactEmail, "");
  const history = reviewedSubmission(project, "judge");
  assert.equal(history.importedFields, undefined);
  assert.equal(history.contactEmail, "");
});

test("PostgreSQL JSON object key reordering preserves verified review contents", () => {
  const source = fixture();
  const imported = buildImportedEvent(source, assets(source));
  function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([k, v]) => [k, reorder(v)]),
      );
    return value;
  }
  const stored = JSON.parse(JSON.stringify(reorder(imported)));
  assert.equal(verifyImportedEvent(source, stored).preliminaryReviews, 1);
  stored.submissions[0].reviews[0].notes = "Changed";
  assert.throws(() => verifyImportedEvent(source, stored), /reviews/);
});
