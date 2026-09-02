'use strict';

// Reference data for the two states the business actually operates in.
//
// IDs are DETERMINISTIC rather than gen_random_uuid(): that plus the
// plants_code_uniq constraint is what makes `npm run seed:up` idempotent, so
// re-running it is a no-op instead of duplicating every plant. Downstream seeders
// still resolve plants by `code`, never by pasting these UUIDs, so they keep
// working if a plant was inserted by hand.
const PLANTS = [
  // Gujarat
  { id: 'a0000001-0000-4000-8000-000000000001', code: 'GJ-SUR-01', name: 'Surat Weaving Unit 1',      city: 'Surat',      state: 'Gujarat' },
  { id: 'a0000001-0000-4000-8000-000000000002', code: 'GJ-SUR-02', name: 'Surat Processing Unit 2',   city: 'Surat',      state: 'Gujarat' },
  { id: 'a0000001-0000-4000-8000-000000000003', code: 'GJ-AHM-01', name: 'Ahmedabad Spinning Mill',   city: 'Ahmedabad',  state: 'Gujarat' },
  { id: 'a0000001-0000-4000-8000-000000000004', code: 'GJ-JET-01', name: 'Jetpur Dyeing Works',       city: 'Jetpur',     state: 'Gujarat' },
  // Maharashtra
  { id: 'a0000001-0000-4000-8000-000000000005', code: 'MH-BHI-01', name: 'Bhiwandi Powerloom Hub 1',  city: 'Bhiwandi',   state: 'Maharashtra' },
  { id: 'a0000001-0000-4000-8000-000000000006', code: 'MH-ICH-01', name: 'Ichalkaranji Weaving Unit', city: 'Ichalkaranji', state: 'Maharashtra' },
  { id: 'a0000001-0000-4000-8000-000000000007', code: 'MH-SOL-01', name: 'Solapur Terry Towel Unit',  city: 'Solapur',    state: 'Maharashtra' },
  { id: 'a0000001-0000-4000-8000-000000000008', code: 'MH-MAL-01', name: 'Malegaon Powerloom Hub 2',  city: 'Malegaon',   state: 'Maharashtra' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      { tableName: 'plants', schema: 'app' },
      PLANTS.map((p) => ({ ...p, is_active: true, created_at: now, updated_at: now })),
      // Emits "ON CONFLICT DO NOTHING" on the postgres dialect.
      { ignoreDuplicates: true },
    );
  },

  async down(queryInterface, Sequelize) {
    // Scoped to the seeded codes, NOT a blanket delete: a plant added by hand
    // must survive a seed rollback.
    await queryInterface.bulkDelete(
      { tableName: 'plants', schema: 'app' },
      { code: { [Sequelize.Op.in]: PLANTS.map((p) => p.code) } },
    );
  },
};
