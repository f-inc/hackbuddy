# Night Hack import

The importer copies source data; it never writes to or deletes from Airtable.
Default targets are the registered Night Hack III and IV events. It retains the
same event and submission IDs, slugs, original scoring policy, complete review
history, finalist state, ballots, and published snapshots. Published scores are
not recomputed. Imported events keep submissions closed.

## Credentials and media

Use the existing Airtable read credentials and Supabase PostgreSQL configuration.
For media, set server-only `R2_ACCOUNT_ID`, `R2_BUCKET=hackbuddy-media`,
`R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Use object read/write access scoped
only to this private bucket. Public bucket access must remain disabled.
Supabase stores the asset index, original source archives, and event records.

Files are downloaded into a private local cache, checked against source sizes,
then copied and checksum-verified in R2. All attachments are retained,
including additional files the original project reader did not display. The
original project card shows them in a collapsed **All submitted files** section.
An authenticated, event-scoped endpoint streams photos/videos and supports range
requests. Contact information and raw imported fields are organizer-only.

## Commands

Run from the normal project checkout. `.data/migrations/night-hack` is ignored by
git; it contains private source records and media. Keep its permissions private.

```sh
# Read-only source capture; also preserves older/staging tables locally.
node scripts/migrate-airtable.cjs --snapshot

# Copy immutable, verified source snapshots into the private database archive.
node scripts/migrate-airtable.cjs --archive

# Prepare all original media locally while R2 access is configured.
node scripts/migrate-airtable.cjs --download

# Copy/verify files and activate each fully verified event atomically.
node scripts/migrate-airtable.cjs --apply

# Compare destination records, reviews and publication contents to the snapshot.
node scripts/migrate-airtable.cjs --verify
```

`--directory=/absolute/path` changes the private working directory.
`--events=nighthack3,nighthack4` selects explicit event slugs from the snapshot.
Re-running resumes already copied files. Existing destination events are never
overwritten; a matching, unchanged import is verified and retained.

The schema is in `supabase/migrations/202611040002_airtable_import.sql` and is
applied by `--archive`/`--apply`. It adds private source archives and asset metadata.
Original columns and source schemas remain in immutable archives. The event card
also exposes **Original submission fields** to organizers, with durable media
references and the previously unmapped live-demo link.

An event is activated only after all its files are verified, source rows/reviews
are rechecked for changes, and the database copy matches source review history
and publication contents. Archive, asset references and event activation commit
in one transaction. A failure leaves the event using its original reader.

Older Night Hack forms used different judging criteria and presentation decisions.
They are captured locally for completeness and are not silently converted to
modern three-criterion reviews or assigned fabricated judge identities.

The R2 index migration is `supabase/migrations/202611050001_r2_assets.sql`.
Assets are indexed by event, submission, source field, object key and SHA-256.
