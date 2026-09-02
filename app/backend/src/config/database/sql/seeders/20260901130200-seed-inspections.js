'use strict';

// Demo history so the list, the date-range filter, sorting and the summary are all
// immediately demonstrable instead of showing empty states.
//
// Two properties worth knowing:
//  1. client_uuid values are DETERMINISTIC (derived from the row index), so with
//     inspections_logger_client_uuid_uniq this seeder is idempotent -- re-running
//     `seed:up` inserts nothing rather than duplicating 52 rows.
//  2. Randomness comes from a fixed-seed LCG, not Math.random, so the severity /
//     status / defect-type mix is identical on every machine. Only the dates are
//     relative to "now", so the seeded data always looks recent.

const ROW_COUNT = 52;
const DAYS_BACK = 60;

const DEFECT_TYPES = [
  'weave_defect',
  'shade_variation',
  'hole_tear',
  'count_deviation',
  'other',
];

// Weighted so the summary looks like a real shop floor rather than a uniform grid:
// most defects are Major, Critical is the minority that matters.
const SEVERITY_WEIGHTS = [
  ['minor', 0.35],
  ['major', 0.45],
  ['critical', 0.2],
];

// plant_id always matches the logging supervisor's own plant, exactly as the API
// enforces it -- seed data that violates the server's own rule is a trap.
const SUPERVISORS = [
  { email: 'supervisor@example.com', plantCode: 'GJ-SUR-01', machines: ['LOOM-01', 'LOOM-04', 'LOOM-07', 'LOOM-12', 'WARP-02', 'SIZING-01'] },
  { email: 'supervisor2@example.com', plantCode: 'MH-BHI-01', machines: ['PL-03', 'PL-08', 'PL-11', 'PL-19', 'WARP-05'] },
];

const REMARKS = [
  'Noticed during routine hourly check on the A-shift.',
  'Operator flagged it after a warp beam change.',
  'Recurring on the same fabric width; needs a mechanic look.',
  'Visible under the inspection lamp, not in daylight.',
  'Found on the tail end of the roll.',
  null,
  null,
];

const OTHER_REMARKS = [
  'Selvedge fraying along roughly two metres.',
  'Oil stain from the overhead drive, about a palm-width.',
  'Reed mark running the full length of the piece.',
  'Temple cut mark repeating every few centimetres.',
];

const RESOLUTION_NOTES = [
  'Mechanic re-tensioned the warp and reset the temple. Verified two rolls clean after.',
  'Dye batch re-checked against the master shade card; operator retrained on batch mixing.',
  'Damaged section cut out and the roll re-graded to B. Loom stopped for a shuttle check.',
  'Count verified on the wrap reel; sizing recipe corrected for the next set.',
  'Cleaned the drive guard and fitted a drip tray. Affected metres scrapped.',
  'Reed replaced. Piece downgraded and logged against the shift report.',
];

// Deterministic LCG (Numerical Recipes constants) so the data mix is reproducible.
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pickWeighted(random, weights) {
  const roll = random();
  let cumulative = 0;
  for (const [value, weight] of weights) {
    cumulative += weight;
    if (roll < cumulative) return value;
  }
  return weights[weights.length - 1][0];
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

// A stable, v4-shaped uuid derived from the row index. Readable in psql, which
// makes debugging the idempotency path much easier than opaque random uuids.
function seededClientUuid(index) {
  const suffix = String(index).padStart(12, '0');
  return `c0000001-0000-4000-8000-${suffix}`;
}

function toDateOnly(date) {
  // Format in UTC deliberately: the value is written to a DATE column, and
  // building it from local parts would shift the day for anyone west of UTC.
  return date.toISOString().slice(0, 10);
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [plants, users] = await Promise.all([
      queryInterface.sequelize.query('SELECT id, code FROM "app"."plants";', {
        type: Sequelize.QueryTypes.SELECT,
      }),
      queryInterface.sequelize.query(
        'SELECT id, email, role FROM "app"."users";',
        { type: Sequelize.QueryTypes.SELECT },
      ),
    ]);

    const plantIdByCode = new Map(plants.map((p) => [p.code, p.id]));
    const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));
    const qaManager = users.find((u) => u.role === 'qa_manager');

    if (!qaManager) {
      throw new Error(
        'No qa_manager found -- run the users seeder before this one.',
      );
    }

    const random = createRandom(20260901);
    const now = Date.now();
    const rows = [];

    for (let index = 1; index <= ROW_COUNT; index += 1) {
      const supervisor = SUPERVISORS[index % SUPERVISORS.length];
      const loggedByUserId = userIdByEmail.get(supervisor.email);
      const plantId = plantIdByCode.get(supervisor.plantCode);
      if (!loggedByUserId || !plantId) {
        throw new Error(
          `Missing user ${supervisor.email} or plant ${supervisor.plantCode} -- run the earlier seeders first.`,
        );
      }

      const daysAgo = Math.floor(random() * DAYS_BACK);
      const inspectionDate = new Date(now - daysAgo * 86400000);

      // logged_at sits inside the shift on the inspection date. A slice of rows
      // get a deliberate multi-hour gap between logged_at and created_at so the
      // "logged offline, synced later" case is visible in the seeded data.
      const shiftHour = 6 + Math.floor(random() * 12);
      const loggedAt = new Date(inspectionDate);
      loggedAt.setUTCHours(shiftHour, Math.floor(random() * 60), 0, 0);

      const syncLagMinutes = random() < 0.25 ? Math.floor(random() * 400) + 20 : 1;
      const createdAt = new Date(loggedAt.getTime() + syncLagMinutes * 60000);

      const defectType = pick(random, DEFECT_TYPES);
      const severity = pickWeighted(random, SEVERITY_WEIGHTS);

      // The inspections_other_needs_remarks_chk constraint requires remarks when
      // defect_type is 'other', so this is not optional for that branch.
      const remarks =
        defectType === 'other' ? pick(random, OTHER_REMARKS) : pick(random, REMARKS);

      // ~40% resolved. Critical defects are resolved more often than minor ones,
      // which is both realistic and makes the summary grid non-uniform.
      const resolveChance = severity === 'critical' ? 0.62 : severity === 'major' ? 0.4 : 0.28;
      const isResolved = random() < resolveChance;

      let status = 'open';
      let resolutionNote = null;
      let resolvedByUserId = null;
      let resolvedAt = null;

      if (isResolved) {
        status = 'resolved';
        resolutionNote = pick(random, RESOLUTION_NOTES);
        resolvedByUserId = qaManager.id;
        // Resolved between 2 hours and ~4 days after it was logged, never in the future.
        const resolveDelayMs = (2 + Math.floor(random() * 94)) * 3600000;
        resolvedAt = new Date(Math.min(createdAt.getTime() + resolveDelayMs, now));
      }

      rows.push({
        id: `d0000001-0000-4000-8000-${String(index).padStart(12, '0')}`,
        client_uuid: seededClientUuid(index),
        plant_id: plantId,
        logged_by_user_id: loggedByUserId,
        inspection_date: toDateOnly(inspectionDate),
        machine_line_id: pick(random, supervisor.machines),
        defect_type: defectType,
        severity,
        status,
        remarks,
        resolution_note: resolutionNote,
        resolved_by_user_id: resolvedByUserId,
        resolved_at: resolvedAt,
        logged_at: loggedAt,
        created_at: createdAt,
        updated_at: resolvedAt ?? createdAt,
      });
    }

    await queryInterface.bulkInsert(
      { tableName: 'inspections', schema: 'app' },
      rows,
      { ignoreDuplicates: true },
    );
  },

  async down(queryInterface, Sequelize) {
    const clientUuids = Array.from({ length: ROW_COUNT }, (_, i) =>
      seededClientUuid(i + 1),
    );
    await queryInterface.bulkDelete(
      { tableName: 'inspections', schema: 'app' },
      { client_uuid: { [Sequelize.Op.in]: clientUuids } },
    );
  },
};
