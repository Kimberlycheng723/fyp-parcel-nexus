import {
  getNotificationPreferences,
  getUnreadNotificationCount,
  listNotifications as listNotificationsService,
  markAllNotificationsRead as markAllNotificationsReadService,
  markNotificationRead as markNotificationReadService,
  updateNotificationPreferences
} from "../services/notification.service.js";

function notificationErrorResponse(error) {
  const responses = {
    FORBIDDEN: [403, "Notification access is unavailable for this account."],
    INVALID_UNREAD_FILTER: [400, "Unread filter must be true or false."],
    INVALID_NOTIFICATION_ID: [400, "Notification ID format is invalid."],
    NOTIFICATION_NOT_FOUND: [404, "Notification was not found."],
    PREFERENCES_REQUIRED: [400, "At least one notification preference is required."],
    INVALID_NOTIFICATION_TYPE: [400, "Notification type is invalid."],
    DUPLICATE_NOTIFICATION_TYPE: [400, "A notification type can only be updated once per request."],
    INVALID_PREFERENCE_VALUE: [400, "Notification preference values must be true or false."],
    PREFERENCE_UPDATE_REQUIRED: [400, "At least one notification channel must be updated."],
    IN_APP_REQUIRED: [400, "In-App notifications are required and cannot be disabled."],
    INVALID_NOTIFICATION_TYPE_FOR_ROLE: [400, "This notification type is not available for your role."],
    UNSUPPORTED_NOTIFICATION_CHANNEL: [400, "This notification channel is not available for your role."]
  };
  const [status, message] = responses[error] || [500, "Unable to complete notification request."];

  return {
    status,
    body: { message }
  };
}

function sendResult(res, result) {
  if (result.error) {
    const response = notificationErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.json(result);
}

export async function listNotifications(req, res) {
  const result = await listNotificationsService({
    requester: req.user,
    filters: req.query
  });

  return sendResult(res, result);
}

export async function getUnreadCount(req, res) {
  const result = await getUnreadNotificationCount({
    requester: req.user
  });

  return sendResult(res, result);
}

export async function markNotificationRead(req, res) {
  const result = await markNotificationReadService({
    requester: req.user,
    notificationId: req.params.notificationId
  });

  return sendResult(res, result);
}

export async function markAllNotificationsRead(req, res) {
  const result = await markAllNotificationsReadService({
    requester: req.user
  });

  return sendResult(res, result);
}

export async function getPreferences(req, res) {
  const result = await getNotificationPreferences({
    requester: req.user
  });

  return sendResult(res, result);
}

export async function updatePreferences(req, res) {
  const result = await updateNotificationPreferences({
    requester: req.user,
    input: req.body
  });

  return sendResult(res, result);
}
