'use strict';

// Runs after the plants seeder: `db:seed:all` executes in filename order, so the
// timestamp prefix IS the ordering mechanism.
//
// bcryptjs is pure JavaScript, so this CommonJS seeder can hash at seed time with
// a plain require() -- no native addon, and no "pre-compute the hashes and paste
// the strings in" hack. Rotating the demo password is a one-line edit here.
const bcrypt = require('bcryptjs');

const DEMO_PASSWORD = 'Passw0rd!';
const SALT_ROUNDS = 10;

// Two supervisors at DIFFERENT plants, so per-user scoping is demonstrable (each
// must see only their own rows), plus one org-wide QA manager.
const USERS = [
  {
    id: 'b0000001-0000-4000-8000-000000000001',
    email: 'supervisor@example.com',
    full_name: 'Rakesh Patel',
    role: 'supervisor',
    plant_code: 'GJ-SUR-01',
  },
  {
    id: 'b0000001-0000-4000-8000-000000000002',
    email: 'supervisor2@example.com',
    full_name: 'Sunita Deshmukh',
    role: 'supervisor',
    plant_code: 'MH-BHI-01',
  },
  {
    id: 'b0000001-0000-4000-8000-000000000003',
    email: 'qa@example.com',
    full_name: 'Meera Shah',
    role: 'qa_manager',
    plant_code: 'GJ-SUR-01', // home plant; a QA manager still sees every plant
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // "Seeded known credentials reached production" is catastrophic and entirely
    // preventable, so refuse rather than warn.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Refusing to seed demo users in production: these are publicly documented credentials.',
      );
    }

    // Resolve plant_code -> id with one query instead of duplicating the plant
    // UUIDs across two seeder files.
    const plants = await queryInterface.sequelize.query(
      'SELECT id, code FROM "app"."plants";',
      { type: Sequelize.QueryTypes.SELECT },
    );
    const plantIdByCode = new Map(plants.map((p) => [p.code, p.id]));

    const now = new Date();
    const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, SALT_ROUNDS);

    await queryInterface.bulkInsert(
      { tableName: 'users', schema: 'app' },
      USERS.map((u) => {
        const plantId = plantIdByCode.get(u.plant_code);
        if (!plantId) {
          throw new Error(
            `Plant ${u.plant_code} not found -- run the plants seeder first.`,
          );
        }
        return {
          id: u.id,
          email: u.email,
          password_hash: passwordHash,
          full_name: u.full_name,
          role: u.role,
          plant_id: plantId,
          is_active: true,
          last_login_at: null,
          created_at: now,
          updated_at: now,
        };
      }),
      // ON CONFLICT DO NOTHING with no target covers every unique constraint,
      // so this matches on users_email_uniq.
      { ignoreDuplicates: true },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      { tableName: 'users', schema: 'app' },
      { email: { [Sequelize.Op.in]: USERS.map((u) => u.email) } },
    );
  },
};
