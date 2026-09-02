'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE "app"."plants" (
        "id"         uuid         NOT NULL DEFAULT gen_random_uuid(),
        "code"       varchar(16)  NOT NULL,
        "name"       varchar(120) NOT NULL,
        "city"       varchar(80)  NOT NULL,
        "state"      varchar(80)  NOT NULL,
        "is_active"  boolean      NOT NULL DEFAULT true,
        "created_at" timestamptz  NOT NULL DEFAULT now(),
        "updated_at" timestamptz  NOT NULL DEFAULT now(),

        CONSTRAINT "plants_pkey"      PRIMARY KEY ("id"),
        CONSTRAINT "plants_code_uniq" UNIQUE ("code"),

        -- Canonical-form CHECK: with values forced to upper/trimmed, the plain
        -- UNIQUE above behaves like a case-insensitive unique, with no CITEXT
        -- extension and no functional index.
        CONSTRAINT "plants_code_canonical_chk"
          CHECK ("code" = upper(btrim("code")) AND length("code") >= 3),
        CONSTRAINT "plants_name_not_blank_chk"  CHECK (btrim("name")  <> ''),
        CONSTRAINT "plants_city_not_blank_chk"  CHECK (btrim("city")  <> ''),
        CONSTRAINT "plants_state_not_blank_chk" CHECK (btrim("state") <> '')
      );
    `);

    // No secondary indexes on purpose: this table holds ~8 rows, where a seq scan
    // beats any index and the only cost of adding one is write amplification.
    await queryInterface.sequelize.query(`
      COMMENT ON COLUMN "app"."plants"."code" IS
        'Stable human-readable natural key (e.g. GJ-SUR-01). Lets seeders be idempotent via ON CONFLICT DO NOTHING and lets the users seeder resolve code -> id without hardcoding UUIDs in two files.';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS "app"."plants";');
  },
};
