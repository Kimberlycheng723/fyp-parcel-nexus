import {
  deactivatePushSubscription,
  savePushSubscription
} from "../services/pushSubscription.service.js";
import { getWebPushPublicConfiguration } from "../services/webPush.service.js";

function pushErrorResponse(error) {
  const responses = {
    PUSH_SUBSCRIPTION_FORBIDDEN: [403, "Browser Push is unavailable for this account."],
    INVALID_PUSH_SUBSCRIPTION: [400, "Browser Push subscription data is invalid."],
    PUSH_ENDPOINT_REQUIRED: [400, "Browser Push subscription endpoint is required."]
  };
  const [status, message] = responses[error] || [500, "Unable to update Browser Push."];

  return { status, body: { message } };
}

function sendResult(res, result, successStatus = 200) {
  if (result.error) {
    const response = pushErrorResponse(result.error);
    return res.status(response.status).json(response.body);
  }

  return res.status(successStatus).json(result);
}

export async function getVapidPublicKey(req, res) {
  if (!req.user?.user_id) {
    return res.status(403).json({
      message: "Browser Push is unavailable for this account."
    });
  }

  return res.json(getWebPushPublicConfiguration());
}

export async function subscribeBrowserPush(req, res) {
  const result = await savePushSubscription({
    requester: req.user,
    input: req.body
  });

  return sendResult(res, result, 201);
}

export async function unsubscribeBrowserPush(req, res) {
  const result = await deactivatePushSubscription({
    requester: req.user,
    endpoint: req.body?.endpoint
  });

  return sendResult(res, result);
}
