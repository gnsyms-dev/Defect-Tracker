'use strict';

// CONVENTION FOR EVERY MIGRATION IN THIS FOLDER: raw SQL inside
// queryInterface.sequelize.query(), not the queryInterface.createTable() DSL.
//
// Why:
//  1. The DDL then reads as the schema document it is, and pastes straight into psql.
//  2. It sidesteps the easiest sequelize-cli mistake in this repo -- every
//     queryInterface.* call must be handed { tableName, schema: 'app' } rather than a
//     bare string, or it silently targets `public` instead.
//  3. CHECK constraints, partial indexes and explicitly-named enum types are all
//     directly expressible here; addConstraint({ type: 'CHECK' }) can only render a
//     Sequelize `where` object, which the biconditional constraint in migration 4
//     cannot be written as legibly.
//  4. We forfeit dialect portability we will never use -- docker-compose pins
//     postgres:16-alpine and SqlSchema already hardcodes Postgres schemas.
//
// This migration specifically MUST be raw SQL: queryInterface.createSchema() only
// emits "IF NOT EXISTS" when sequelize.options.databaseVersion is populated and
// >= 9.2.0, and it defaults to 0 -- so you get a bare CREATE SCHEMA that fails on
// any re-run.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE SCHEMA IF NOT EXISTS "app";');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP SCHEMA IF EXISTS "app" CASCADE;');
  },
};
