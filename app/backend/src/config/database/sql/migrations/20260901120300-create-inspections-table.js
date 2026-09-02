'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // The ONE native enum in the schema, and the only column with ordinal
    // semantics. Declared least -> most severe on purpose: Postgres enums compare
    // by declaration order, so `ORDER BY severity DESC` means worst-first for free
    // and `severity >= 'major'` is a real predicate. A varchar + CHECK would force
    // a CASE expression into every sort or a redundant rank column.
    //
    // The name is NOT arbitrary: sequelize-typescript's DataType.ENUM generates
    // exactly "<schema>"."enum_<tableName>_<columnName>", so matching it here keeps
    // changeColumn/describeTable/sync from creating a second, divergent type.
    await queryInterface.sequelize.query(`
      CREATE TYPE "app"."enum_inspections_severity" AS ENUM ('minor', 'major', 'critical');
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE "app"."inspections" (
        "id"                  uuid        NOT NULL DEFAULT gen_random_uuid(),
        "client_uuid"         uuid        NOT NULL,
        "plant_id"            uuid        NOT NULL,
        "logged_by_user_id"   uuid        NOT NULL,
        "inspection_date"     date        NOT NULL,
        "machine_line_id"     varchar(50) NOT NULL,
        "defect_type"         varchar(40) NOT NULL,
        "severity"            "app"."enum_inspections_severity" NOT NULL,
        "status"              varchar(16) NOT NULL DEFAULT 'open',
        "remarks"             text        NULL,
        "resolution_note"     text        NULL,
        "resolved_by_user_id" uuid        NULL,
        "resolved_at"         timestamptz NULL,
        "logged_at"           timestamptz NOT NULL,
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "inspections_pkey" PRIMARY KEY ("id"),

        CONSTRAINT "inspections_plant_fk" FOREIGN KEY ("plant_id")
          REFERENCES "app"."plants" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "inspections_logged_by_fk" FOREIGN KEY ("logged_by_user_id")
          REFERENCES "app"."users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "inspections_resolved_by_fk" FOREIGN KEY ("resolved_by_user_id")
          REFERENCES "app"."users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,

        -- Offline idempotency, SCOPED PER USER rather than globally unique. A
        -- replayed or guessed client_uuid therefore cannot resolve to another
        -- user's row, which is what stops the "return the existing record on
        -- conflict" path from being a cross-user IDOR.
        CONSTRAINT "inspections_logger_client_uuid_uniq"
          UNIQUE ("logged_by_user_id", "client_uuid"),

        CONSTRAINT "inspections_machine_line_not_blank_chk"
          CHECK (btrim("machine_line_id") <> ''),
        CONSTRAINT "inspections_remarks_not_blank_chk"
          CHECK ("remarks" IS NULL OR btrim("remarks") <> ''),

        CONSTRAINT "inspections_defect_type_chk" CHECK ("defect_type" IN
          ('weave_defect', 'shade_variation', 'hole_tear', 'count_deviation', 'other')),
        CONSTRAINT "inspections_status_chk" CHECK ("status" IN ('open', 'resolved')),

        -- "Other" must say what it was, or the escape hatch just produces
        -- unusable data. The DTO enforces this too, so the API returns 400
        -- rather than letting a constraint violation surface as a 500.
        CONSTRAINT "inspections_other_needs_remarks_chk" CHECK (
          "defect_type" <> 'other'
          OR ("remarks" IS NOT NULL AND btrim("remarks") <> '')
        ),

        -- The brief's hardest rule -- "mark as Resolved with a MANDATORY
        -- resolution note" -- made physically impossible to violate, rather than
        -- a DTO rule that a script or a manual UPDATE can bypass. Note NOT NULL
        -- alone would happily accept ''.
        --
        -- Being biconditional is also what makes storing status safe despite it
        -- being derivable from resolved_at: the two representations are provably
        -- equivalent, so they cannot drift.
        CONSTRAINT "inspections_resolution_consistency_chk" CHECK (
          (
            "status" = 'open'
            AND "resolved_at" IS NULL
            AND "resolution_note" IS NULL
            AND "resolved_by_user_id" IS NULL
          )
          OR (
            "status" = 'resolved'
            AND "resolved_at" IS NOT NULL
            AND "resolved_by_user_id" IS NOT NULL
            AND "resolution_note" IS NOT NULL
            AND btrim("resolution_note") <> ''
          )
        )
      );
    `);

    // ---- Indexes. Each one exists for a named query; nothing speculative. ----
    // No DESC anywhere: Postgres scans a btree backwards at full speed, so an
    // ascending index serves ORDER BY ... DESC identically. DESC only earns its
    // keep for MIXED-direction sorts, which this app does not have -- writing it
    // would imply a subtlety that isn't there.

    // Supervisor's own list and own summary:
    //   WHERE logged_by_user_id = $1 [AND ...] ORDER BY inspection_date, created_at
    await queryInterface.sequelize.query(`
      CREATE INDEX "inspections_logger_date_idx"
        ON "app"."inspections" ("logged_by_user_id", "inspection_date", "created_at");
    `);

    // QA list/summary when a plantId filter is supplied.
    await queryInterface.sequelize.query(`
      CREATE INDEX "inspections_plant_date_idx"
        ON "app"."inspections" ("plant_id", "inspection_date", "created_at");
    `);

    // The QA manager's landing screen: open defects, all plants, newest first --
    // the single hottest query in the app. A PARTIAL index is the textbook fit:
    // the resolved set grows forever while the open set stays roughly constant,
    // so this index stays permanently small as the table grows.
    await queryInterface.sequelize.query(`
      CREATE INDEX "inspections_open_date_idx"
        ON "app"."inspections" ("inspection_date", "created_at")
        WHERE "status" = 'open';
    `);

    // Deliberately NOT indexed: severity / status / defect_type on their own
    // (2-5 distinct values -- never selective enough to beat filtering the rows
    // the composite indexes already narrowed); machine_line_id (its ILIKE '%..%'
    // always runs after a scope filter, so it filters hundreds of rows, not a
    // whole table -- revisit past ~1M rows with pg_trgm + GIN); created_at alone
    // (no endpoint filters or sorts on it without a leading scope column).

    await queryInterface.sequelize.query(`
      COMMENT ON COLUMN "app"."inspections"."client_uuid" IS
        'Client-generated idempotency key from the offline outbox, required on every create (including online ones, so there is exactly one write path). Unique per (logged_by_user_id, client_uuid).';
    `);
    await queryInterface.sequelize.query(`
      COMMENT ON COLUMN "app"."inspections"."inspection_date" IS
        'Calendar date, deliberately DATE and not TIMESTAMPTZ: as a timestamp, "1 Sep" entered in IST stores as 2026-08-31T18:30:00Z and every UTC-side format/date_trunc reports it under 31 Aug.';
    `);
    await queryInterface.sequelize.query(`
      COMMENT ON COLUMN "app"."inspections"."logged_at" IS
        'Device clock when the supervisor pressed Save (UNTRUSTED -- clamped server-side). created_at is the server insert/sync time, so created_at - logged_at is the sync lag and logged_at::date vs inspection_date is the backdating lag. These are the metrics that prove the paper register was replaced.';
    `);
    await queryInterface.sequelize.query(`
      COMMENT ON COLUMN "app"."inspections"."plant_id" IS
        'Where the inspection happened. Snapshotted from the logging user at insert time and NOT derived at read time, so a supervisor transferring plants does not retroactively rewrite their history.';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS "app"."inspections";');
    // Sequelize does NOT drop enum types on dropTable/removeColumn, and the
    // failure mode is subtler than "type already exists": its own CREATE TYPE is
    // wrapped in DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$, so a
    // down:all -> up cycle would SILENTLY SUCCEED while keeping a stale type
    // carrying the old value list. Dropping it explicitly is what makes the
    // round-trip honest.
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "app"."enum_inspections_severity";',
    );
  },
};
