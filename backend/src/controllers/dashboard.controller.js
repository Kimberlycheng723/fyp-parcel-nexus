import { getAdminDashboard } from "../services/dashboard.service.js";

function dashboardErrorResponse(error) {
  const responses = {
    FORBIDDEN: [403, "Only Admin can access the admin dashboard."],
    INVALID_PERIOD: [400, "Period must be day, week, or month."],
    INVALID_START_DATE: [400, "Start date must use YYYY-MM-DD format."]
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
