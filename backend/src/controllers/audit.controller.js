import { exportAuditLogsCsv, listAuditLogs } from "../services/audit.service.js";

function errorResponse(error) {
  const responses = {
    FORBIDDEN: [403, "You do not have permission to access the Audit Trail."],
    EXPORT_FORBIDDEN: [403, "Only Admin users can export the Audit Trail."],
    INVALID_DATE: [400, "Date must use YYYY-MM-DD format."],
    INVALID_ACTION: [400, "One or more audit actions are invalid."],
    INVALID_ROLE: [400, "Audit role filter is invalid."]
  };
  const [status, message] = responses[error] || [500, "Unable to complete Audit Trail request."];
  return { status, message };
}

export async function getAuditLogs(req, res) {
  const result = await listAuditLogs({ requester: req.user, filters: req.query });
  if (result.error) {
    const response = errorResponse(result.error);
    return res.status(response.status).json({ message: response.message });
  }
  return res.json(result);
}

export async function exportAuditLogs(req, res) {
  const result = await exportAuditLogsCsv({ requester: req.user, filters: req.query });
  if (result.error) {
    const response = errorResponse(result.error);
    return res.status(response.status).json({ message: response.message });
  }
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="parcel-nexus-audit-trail-${date}.csv"`);
  return res.send(`\uFEFF${result.csv}`);
}
