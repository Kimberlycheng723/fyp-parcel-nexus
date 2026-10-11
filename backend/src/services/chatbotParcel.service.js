import { CHATBOT_LIMITS, ChatbotError, isPlainObject } from "../utils/chatbot.js";

const limitProperty = { type: "integer", minimum: 1, maximum: 10, description: "Maximum records, defaults to 5." };
const trackingProperty = { type: "string", minLength: 1, maxLength: 120, description: "Exact tracking number, not a wildcard." };
const definitions = [
  ["get_pending_parcel_count", "Count all own uncollected parcels, including overdue, with overdue subtotal.", {}],
  ["list_pending_parcels", "List own pending parcels, newest first, including overdue.", { limit: limitProperty }],
  ["get_parcel_status", "Get the status and identity of the Resident's latest registered parcel.", {}],
  ["get_parcel_locations", "Get own pending parcel identities and location availability. No storage location is currently recorded.", { limit: limitProperty }],
  ["get_collection_history", "List own recently collected parcels, most recent collection first.", { limit: limitProperty }],
  ["get_parcel_by_tracking_number", "Look up an own parcel using an exact tracking number, case insensitive.", { tracking_number: trackingProperty }]
];

export const CHATBOT_FUNCTION_DECLARATIONS = definitions.map(([name, description, properties]) => ({
  name,
  description,
  parametersJsonSchema: {
    type: "object", properties, additionalProperties: false,
    required: name === "get_parcel_by_tracking_number" ? ["tracking_number"] : []
  }
}));
const allowedArguments = new Map(definitions.map(([name, , properties]) => [name, Object.keys(properties)]));

// Identity comes only from verified middleware, never from model arguments or message text.
const OWN_PARCELS = `
  FROM parcels p
  INNER JOIN users resident ON resident.unit_id = p.unit_id
  INNER JOIN courier_companies c ON c.courier_id = p.courier_id
  WHERE resident.user_id = $1 AND resident.role = 'RESIDENT' AND resident.status = 'ACTIVE'
    AND p.deleted_at IS NULL AND p.status IN ('PENDING', 'PENDING_COLLECTION', 'COLLECTED')
`;
const PARCEL_FIELDS = `
  p.tracking_number, c.courier_name,
  CASE WHEN p.status = 'PENDING' THEN 'PENDING_COLLECTION' ELSE p.status END AS status,
  (p.status IN ('PENDING', 'PENDING_COLLECTION') AND p.collection_deadline < NOW()) AS is_overdue,
  p.collection_deadline, p.created_at AS registered_at, p.collected_at
`;

function validateTool(name, input) {
  const keys = allowedArguments.get(name);
  if (!keys || !isPlainObject(input) || Object.keys(input).some((key) => !keys.includes(key))) {
    throw new ChatbotError("INVALID_CHATBOT_TOOL", 502, "The assistant requested an unsupported parcel lookup. Please rephrase your question.");
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10)) {
    throw new ChatbotError("INVALID_CHATBOT_TOOL", 502, "The assistant requested an invalid parcel limit. Please try again.");
  }
  if (name === "get_parcel_by_tracking_number" && (typeof input.tracking_number !== "string"
    || !input.tracking_number.trim() || input.tracking_number.length > 120)) {
    throw new ChatbotError("INVALID_CHATBOT_TOOL", 502, "The assistant requested an invalid tracking number. Please try again.");
  }
  return { limit: input.limit ?? 5, tracking: input.tracking_number?.trim() };
}

export function createChatbotParcelTools(db) {
  return async function executeParcelTool({ name, args = {}, requester }) {
    if (requester?.role !== "RESIDENT" || !requester.user_id) {
      throw new ChatbotError("CHATBOT_FORBIDDEN", 403, "Only Residents can use the parcel assistant.");
    }
    const { limit, tracking } = validateTool(name, args);
    const values = [requester.user_id];
    let text;
    if (name === "get_pending_parcel_count") {
      text = `SELECT COUNT(*)::integer AS pending_count,
        COUNT(*) FILTER (WHERE p.collection_deadline < NOW())::integer AS overdue_count
        ${OWN_PARCELS} AND p.status IN ('PENDING', 'PENDING_COLLECTION')`;
    } else {
      let filter = "";
      let order = "p.created_at DESC, p.parcel_id DESC";
      if (["list_pending_parcels", "get_parcel_locations"].includes(name)) {
        filter = "AND p.status IN ('PENDING', 'PENDING_COLLECTION')";
      } else if (name === "get_collection_history") {
        filter = "AND p.status = 'COLLECTED'";
        order = "p.collected_at DESC NULLS LAST, p.parcel_id DESC";
      } else if (name === "get_parcel_by_tracking_number") {
        filter = "AND LOWER(p.tracking_number) = LOWER($2)";
        values.push(tracking);
      }
      values.push(name === "get_parcel_status" ? 1 : limit + 1);
      text = `SELECT ${PARCEL_FIELDS} ${OWN_PARCELS} ${filter}
        ORDER BY ${order} LIMIT $${values.length}`;
    }
    let rows;
    try {
      ({ rows } = await db.query({ text, values, query_timeout: CHATBOT_LIMITS.queryTimeoutMs }));
    } catch {
      throw new ChatbotError("CHATBOT_DATABASE_UNAVAILABLE", 503, "Parcel information is temporarily unavailable. Please try again later.");
    }
    if (name === "get_pending_parcel_count") return rows[0];
    if (name === "get_parcel_status") return { parcel: rows[0] ?? null };
    const result = { parcels: rows.slice(0, limit), has_more: rows.length > limit };
    if (name === "get_parcel_locations" || name === "get_parcel_by_tracking_number") {
      result.storage_location_available = false;
      result.storage_location = null;
      result.location_note = "Parcel storage rooms/shelves are not recorded in Parcel Nexus. Ask the Guard for the actual location.";
    }
    return result;
  };
}
