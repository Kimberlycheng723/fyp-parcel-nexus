import { generateAdminReport, getAdminDashboard } from "../services/dashboard.service.js";

function dashboardErrorResponse(error) {
  const responses = {
    FORBIDDEN: [403, "Only Admin can access the admin dashboard."],
    INVALID_PERIOD: [400, "Period must be day, week, or month."],
    INVALID_START_DATE: [400, "Start date must use YYYY-MM-DD format."],
    INVALID_REPORT_TYPE: [400, "Report type must be dashboard_summary, parcel_records, or user_account_summary."],
    INVALID_FORMAT: [400, "Format must be csv or pdf."]
  };

  const [status, message] = responses[error] || [500, "Unable to load dashboard data."];
  return { status, body: { message } };
}

export async function getAdminDashboardData(req, res) {
  const result = await getAdminDashboard({
    requester: req.user,
    period: req.query.period || "day",
    startDate: req.query.start_date
  });

  if (result.error) {
    const response = dashboardErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function exportAdminReport(req, res) {
  const result = await generateAdminReport({
    requester: req.user,
    reportType: req.query.report_type,
    format: req.query.format,
    period: req.query.period || "day",
    startDate: req.query.start_date
  });

  if (result.error) {
    const response = dashboardErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  return res.send(result.content);
}
