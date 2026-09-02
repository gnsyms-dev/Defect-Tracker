'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE "app"."users" (
        "id"            uuid         NOT NULL DEFAULT gen_random_uuid(),
        "email"         varchar(160) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "full_name"     varchar(120) NOT NULL,
        "role"          varchar(20)  NOT NULL,
        "plant_id"      uuid         NOT NULL,
        "is_active"     boolean      NOT NULL DEFAULT true,
        "last_login_at" timestamptz  NULL,
        "created_at"    timestamptz  NOT NULL DEFAULT now(),
        "updated_at"    timestamptz  NOT NULL DEFAULT now(),

        CONSTRAINT "users_pkey"       PRIMARY KEY ("id"),
        CONSTRAINT "users_email_uniq" UNIQUE ("email"),

        -- RESTRICT, never CASCADE: cascading a plant delete must not be able to
        -- take its staff (and, transitively, their defect register) with it.
        CONSTRAINT "users_plant_fk" FOREIGN KEY ("plant_id")
          REFERENCES "app"."plants" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION,

        -- Canonical-form CHECK makes the plain UNIQUE above case-insensitive, so
        -- Ravi@x.com cannot shadow ravi@x.com into a login that mysteriously fails.
        CONSTRAINT "users_email_lower_chk"         CHECK ("email" = lower("email")),
        CONSTRAINT "users_full_name_not_blank_chk" CHECK (btrim("full_name") <> ''),

        -- varchar + CHECK rather than a native enum: roles have no ordinal use and
        -- are the most likely thing to grow AND be rolled back (plant_admin,
        -- auditor...). A CHECK swap is one reversible migration; ALTER TYPE ADD
        -- VALUE is permanent.
        CONSTRAINT "users_role_chk" CHECK ("role" IN ('supervisor', 'qa_manager'))
      );
    `);

    // No index on plant_id: nothing queries users by plant, and the FK RESTRICT
    // check on a plant delete scans ~20 rows.
    await queryInterface.sequelize.query(`
      COMMENT ON COLUMN "app"."users"."is_active" IS
        'Offboarding switch. Because every FK into this table is ON DELETE RESTRICT, disabling is the supported way to remove someone whose entries are in the register; deleting them is meant to fail loudly.';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS "app"."users";');
  },
};
