import { pool } from "../db/pool.js";
import { createActivationTokenForUser } from "./activation.service.js";
import { buildActivationLink, sendActivationEmail } from "./email.service.js";
import { findOrCreateUnitByCode, getUnitCodeFromInput } from "./unit.service.js";
import {
  isValidEmail,
  isValidUserRole,
  isValidUserStatus,
  normalizeEmail,
  normalizeOptionalString,
  normalizeRequiredString
} from "../utils/userValidation.js";

const USER_DETAIL_COLUMNS = `
  u.user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.phone_number,
  u.role,
  u.unit_id,
  u.created_by,
  u.assigned_post,
  u.status,
  u.created_at,
  u.updated_at,
  units.block,
  units.floor,
  units.unit_number,
  units.full_unit_code
`;

function allowedRolesForRequester(requesterRole) {
  if (requesterRole === "SUPER_ADMIN") {
    return ["ADMIN"];
  }

  if (requesterRole === "ADMIN") {
    return ["GUARD", "RESIDENT"];
  }

  return [];
}

function canManageRole(requesterRole, targetRole) {
  return allowedRolesForRequester(requesterRole).includes(targetRole);
}

function toSafeUser(row) {
  return {
    user_id: row.user_id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone_number: row.phone_number,
    role: row.role,
    unit_id: row.unit_id,
    unit: row.unit_id
      ? {
          unit_id: row.unit_id,
          block: row.block,
          floor: row.floor,
          unit_number: row.unit_number,
          full_unit_code: row.full_unit_code
        }
      : null,
    assigned_post: row.assigned_post,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function getDevelopmentActivationData(rawToken) {
  if (process.env.NODE_ENV !== "development") {
    return {};
  }

  return {
    developmentActivationToken: rawToken,
    developmentActivationLink: buildActivationLink(rawToken)
  };
}

async function getUserRowById(userId, client = pool) {
  const result = await client.query(
    `
      SELECT ${USER_DETAIL_COLUMNS}
      FROM users u
      LEFT JOIN units ON units.unit_id = u.unit_id
      WHERE u.user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function emailExists(email, excludedUserId = null, client = pool) {
  const result = await client.query(
    `
      SELECT user_id
      FROM users
      WHERE LOWER(email) = $1
        AND ($2::uuid IS NULL OR user_id <> $2::uuid)
      LIMIT 1
    `,
    [email, excludedUserId]
  );

  return Boolean(result.rows[0]);
}

async function unitHasResidentAccount(unitId, excludedUserId = null, client = pool) {
  const result = await client.query(
    `
      SELECT user_id
      FROM users
      WHERE unit_id = $1
        AND role = 'RESIDENT'
        AND status IN ('PENDING_ACTIVATION', 'ACTIVE')
        AND ($2::uuid IS NULL OR user_id <> $2::uuid)
      LIMIT 1
    `,
    [unitId, excludedUserId]
  );

  return Boolean(result.rows[0]);
}

function validateCreateInput({ requesterRole, input }) {
  const role = normalizeRequiredString(input.role).toUpperCase();
  const email = normalizeEmail(input.email);
  const phoneNumber = normalizeRequiredString(input.phone_number);
  const firstName = normalizeOptionalString(input.first_name);
  const lastName = normalizeOptionalString(input.last_name);
  const assignedPost = normalizeOptionalString(input.assigned_post);
  const fullUnitCode = getUnitCodeFromInput(input);

  if (!role) {
    return { error: "ROLE_REQUIRED" };
  }

  if (!isValidUserRole(role) || role === "SUPER_ADMIN") {
    return { error: "INVALID_ROLE" };
  }

  if (!canManageRole(requesterRole, role)) {
    return { error: "FORBIDDEN_ROLE" };
  }

  if (!email) {
    return { error: "EMAIL_REQUIRED" };
  }

  if (!isValidEmail(email)) {
    return { error: "INVALID_EMAIL" };
  }

  if (!phoneNumber) {
    return { error: "PHONE_REQUIRED" };
  }

  if ((role === "ADMIN" || role === "GUARD") && (!firstName || !lastName)) {
    return { error: "NAME_REQUIRED" };
  }

  if (role === "GUARD" && !assignedPost) {
    return { error: "ASSIGNED_POST_REQUIRED" };
  }

  if (role === "RESIDENT" && !fullUnitCode) {
    return { error: "UNIT_REQUIRED" };
  }

  return {
    value: {
      role,
      email,
      phoneNumber,
      firstName,
      lastName,
      assignedPost: role === "GUARD" ? assignedPost : null,
      fullUnitCode
    }
  };
}

export function getAllowedManagedRoles(requesterRole) {
  return allowedRolesForRequester(requesterRole);
}

export async function createManagedUser({ requester, input }) {
  const validation = validateCreateInput({
    requesterRole: requester.role,
    input
  });

  if (validation.error) {
    return validation;
  }

  const data = validation.value;
  const client = await pool.connect();
  let createdUserId;

  try {
    await client.query("BEGIN");

    if (await emailExists(data.email, null, client)) {
      await client.query("ROLLBACK");
      return { error: "EMAIL_ALREADY_EXISTS" };
    }

    let unitId = null;

    if (data.role === "RESIDENT") {
      const unit = await findOrCreateUnitByCode(data.fullUnitCode, client);
      unitId = unit.unit_id;

      if (await unitHasResidentAccount(unitId, null, client)) {
        await client.query("ROLLBACK");
        return { error: "UNIT_ALREADY_HAS_RESIDENT" };
      }
    }

    const insertResult = await client.query(
      `
        INSERT INTO users (
          email,
          password_hash,
          first_name,
          last_name,
          phone_number,
          role,
          unit_id,
          created_by,
          status,
          assigned_post
        )
        VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'PENDING_ACTIVATION', $8)
        RETURNING user_id
      `,
      [
        data.email,
        data.role === "RESIDENT" ? null : data.firstName,
        data.role === "RESIDENT" ? null : data.lastName,
        data.phoneNumber,
        data.role,
        unitId,
        requester.user_id,
        data.assignedPost
      ]
    );

    await client.query("COMMIT");
    createdUserId = insertResult.rows[0].user_id;
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return { error: "UNIQUE_CONSTRAINT_FAILED" };
    }

    throw error;
  } finally {
    client.release();
  }

  const activationToken = await createActivationTokenForUser(createdUserId);
  const activationLink = buildActivationLink(activationToken.rawToken);
  let emailResult;

  try {
    emailResult = await sendActivationEmail({
      to: data.email,
      activationLink
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Activation email could not be sent. Check SMTP configuration.");
    }

    emailResult = {
      sent: false,
      skipped: false,
      failed: true
    };
  }

  return {
    user: toSafeUser(await getUserRowById(createdUserId)),
    activationEmail: {
      sent: emailResult.sent,
      skipped: emailResult.skipped || false,
      failed: emailResult.failed || false
    },
    ...getDevelopmentActivationData(activationToken.rawToken)
  };
}

export async function listManagedUsers({ requester, filters = {} }) {
  const allowedRoles = allowedRolesForRequester(requester.role);

  if (allowedRoles.length === 0) {
    return { error: "FORBIDDEN" };
  }

  const requestedRole = normalizeRequiredString(filters.role).toUpperCase();
  const requestedStatus = normalizeRequiredString(filters.status).toUpperCase();
  const search = normalizeRequiredString(filters.search);
  const page = Math.max(Number(filters.page || 1), 1);
  const limit = Math.min(Math.max(Number(filters.limit || 20), 1), 100);
  const offset = (page - 1) * limit;

  if (requestedRole && !allowedRoles.includes(requestedRole)) {
    return { error: "FORBIDDEN_ROLE" };
  }

  if (requestedStatus && !isValidUserStatus(requestedStatus)) {
    return { error: "INVALID_STATUS" };
  }

  const whereClauses = ["u.role = ANY($1::text[])"];
  const params = [requestedRole ? [requestedRole] : allowedRoles];

  if (requestedStatus) {
    params.push(requestedStatus);
    whereClauses.push(`u.status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    whereClauses.push(`
      (
        LOWER(u.email) LIKE $${params.length}
        OR LOWER(COALESCE(u.first_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(u.last_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(u.phone_number, '')) LIKE $${params.length}
        OR LOWER(COALESCE(u.assigned_post, '')) LIKE $${params.length}
        OR LOWER(COALESCE(units.full_unit_code, '')) LIKE $${params.length}
      )
    `);
  }

  params.push(limit);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;

  const result = await pool.query(
    `
      SELECT ${USER_DETAIL_COLUMNS}, COUNT(*) OVER() AS total_count
      FROM users u
      LEFT JOIN units ON units.unit_id = u.unit_id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY u.created_at DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `,
    params
  );

  const total = Number(result.rows[0]?.total_count || 0);

  return {
    users: result.rows.map(toSafeUser),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getManagedUserById({ requester, userId }) {
  const user = await getUserRowById(userId);

  if (!user) {
    return { error: "USER_NOT_FOUND" };
  }

  if (!canManageRole(requester.role, user.role)) {
    return { error: "FORBIDDEN" };
  }

  return {
    user: toSafeUser(user)
  };
}

export async function updateManagedUser({ requester, userId, updates }) {
  const currentUser = await getUserRowById(userId);

  if (!currentUser) {
    return { error: "USER_NOT_FOUND" };
  }

  if (!canManageRole(requester.role, currentUser.role)) {
    return { error: "FORBIDDEN" };
  }

  const email = normalizeEmail(updates.email ?? currentUser.email);
  const phoneNumber = normalizeRequiredString(updates.phone_number ?? currentUser.phone_number);
  const firstName = normalizeOptionalString(updates.first_name ?? currentUser.first_name);
  const lastName = normalizeOptionalString(updates.last_name ?? currentUser.last_name);
  const assignedPost = normalizeOptionalString(updates.assigned_post ?? currentUser.assigned_post);
  const fullUnitCode = getUnitCodeFromInput(updates);

  if (!email) {
    return { error: "EMAIL_REQUIRED" };
  }

  if (!isValidEmail(email)) {
    return { error: "INVALID_EMAIL" };
  }

  if (!phoneNumber) {
    return { error: "PHONE_REQUIRED" };
  }

  if ((currentUser.role === "ADMIN" || currentUser.role === "GUARD") && (!firstName || !lastName)) {
    return { error: "NAME_REQUIRED" };
  }

  if (currentUser.role === "GUARD" && !assignedPost) {
    return { error: "ASSIGNED_POST_REQUIRED" };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (await emailExists(email, userId, client)) {
      await client.query("ROLLBACK");
      return { error: "EMAIL_ALREADY_EXISTS" };
    }

    let unitId = currentUser.unit_id;

    if (currentUser.role === "RESIDENT" && fullUnitCode) {
      const unit = await findOrCreateUnitByCode(fullUnitCode, client);
      unitId = unit.unit_id;

      if (await unitHasResidentAccount(unitId, userId, client)) {
        await client.query("ROLLBACK");
        return { error: "UNIT_ALREADY_HAS_RESIDENT" };
      }
    }

    await client.query(
      `
        UPDATE users
        SET
          email = $1,
          phone_number = $2,
          first_name = $3,
          last_name = $4,
          assigned_post = $5,
          unit_id = $6
        WHERE user_id = $7
      `,
      [
        email,
        phoneNumber,
        currentUser.role === "RESIDENT" ? null : firstName,
        currentUser.role === "RESIDENT" ? null : lastName,
        currentUser.role === "GUARD" ? assignedPost : null,
        currentUser.role === "RESIDENT" ? unitId : null,
        userId
      ]
    );

    await client.query("COMMIT");

    return {
      user: toSafeUser(await getUserRowById(userId))
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return { error: "UNIQUE_CONSTRAINT_FAILED" };
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function updateManagedUserStatus({ requester, userId, status }) {
  const normalizedStatus = normalizeRequiredString(status).toUpperCase();

  if (!["ACTIVE", "DEACTIVATED"].includes(normalizedStatus)) {
    return { error: "INVALID_STATUS" };
  }

  if (requester.user_id === userId) {
    return { error: "CANNOT_UPDATE_SELF_STATUS" };
  }

  const currentUser = await getUserRowById(userId);

  if (!currentUser) {
    return { error: "USER_NOT_FOUND" };
  }

  if (!canManageRole(requester.role, currentUser.role)) {
    return { error: "FORBIDDEN" };
  }

  if (normalizedStatus === "ACTIVE") {
    const passwordResult = await pool.query(
      `
        SELECT password_hash
        FROM users
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (!passwordResult.rows[0]?.password_hash) {
      return { error: "CANNOT_ACTIVATE_WITHOUT_PASSWORD" };
    }
  }

  await pool.query(
    `
      UPDATE users
      SET status = $1
      WHERE user_id = $2
    `,
    [normalizedStatus, userId]
  );

  return {
    user: toSafeUser(await getUserRowById(userId))
  };
}

export async function resendManagedActivationEmail({ requester, userId }) {
  const user = await getUserRowById(userId);

  if (!user) {
    return { error: "USER_NOT_FOUND" };
  }

  if (!canManageRole(requester.role, user.role)) {
    return { error: "FORBIDDEN" };
  }

  if (user.status !== "PENDING_ACTIVATION") {
    return { error: "USER_NOT_PENDING_ACTIVATION" };
  }

  const activationToken = await createActivationTokenForUser(userId);
  const activationLink = buildActivationLink(activationToken.rawToken);
  let emailResult;

  try {
    emailResult = await sendActivationEmail({
      to: user.email,
      activationLink
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Activation email could not be resent. Check SMTP configuration.");
    }

    emailResult = {
      sent: false,
      skipped: false,
      failed: true
    };
  }

  return {
    message: emailResult.failed
      ? "Activation token was generated, but email could not be sent. Please check SMTP settings."
      : "Activation email resent successfully.",
    activationEmail: {
      sent: emailResult.sent,
      skipped: emailResult.skipped || false,
      failed: emailResult.failed || false
    },
    ...getDevelopmentActivationData(activationToken.rawToken)
  };
}
