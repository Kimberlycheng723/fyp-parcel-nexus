import { pool } from "../db/pool.js";
import { normalizeRequiredString } from "../utils/userValidation.js";

function parseUnitCode(fullUnitCode) {
  const normalizedCode = normalizeRequiredString(fullUnitCode).toUpperCase();
  const parts = normalizedCode.split("-").map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 3) {
    return {
      block: parts[0],
      floor: parts[1],
      unit_number: parts.slice(2).join("-"),
      full_unit_code: normalizedCode
    };
  }

  return {
    block: "UNKNOWN",
    floor: "UNKNOWN",
    unit_number: normalizedCode,
    full_unit_code: normalizedCode
  };
}

export function getUnitCodeFromInput(input = {}) {
  return normalizeRequiredString(
    input.full_unit_code ||
      input.unit_code ||
      input.unit ||
      input.unitNumber ||
      input.unit_number
  ).toUpperCase();
}

export async function findOrCreateUnitByCode(fullUnitCode, client = pool) {
  const parsedUnit = parseUnitCode(fullUnitCode);

  const existingUnitResult = await client.query(
    `
      SELECT unit_id, block, floor, unit_number, full_unit_code
      FROM units
      WHERE UPPER(full_unit_code) = $1
      LIMIT 1
    `,
    [parsedUnit.full_unit_code]
  );

  if (existingUnitResult.rows[0]) {
    return existingUnitResult.rows[0];
  }

  const createdUnitResult = await client.query(
    `
      INSERT INTO units (
        block,
        floor,
        unit_number,
        full_unit_code
      )
      VALUES ($1, $2, $3, $4)
      RETURNING unit_id, block, floor, unit_number, full_unit_code
    `,
    [
      parsedUnit.block,
      parsedUnit.floor,
      parsedUnit.unit_number,
      parsedUnit.full_unit_code
    ]
  );

  return createdUnitResult.rows[0];
}

export async function searchUnits({ search }) {
  const searchText = normalizeRequiredString(search);

  if (!searchText) {
    return {
      units: []
    };
  }

  const result = await pool.query(
    `
      SELECT
        units.unit_id,
        units.block,
        units.floor,
        units.unit_number,
        units.full_unit_code,
        resident.user_id AS resident_user_id,
        resident.status AS resident_status
      FROM units
      LEFT JOIN users resident
        ON resident.unit_id = units.unit_id
        AND resident.role = 'RESIDENT'
      WHERE LOWER(units.full_unit_code) LIKE LOWER($1)
        OR LOWER(units.block) LIKE LOWER($1)
        OR LOWER(units.floor) LIKE LOWER($1)
        OR LOWER(units.unit_number) LIKE LOWER($1)
      ORDER BY units.full_unit_code ASC
      LIMIT 20
    `,
    [`%${searchText}%`]
  );

  return {
    units: result.rows
  };
}

export async function getUnitById(unitId, client = pool) {
  const result = await client.query(
    `
      SELECT unit_id, block, floor, unit_number, full_unit_code
      FROM units
      WHERE unit_id = $1
      LIMIT 1
    `,
    [unitId]
  );

  return result.rows[0] || null;
}
