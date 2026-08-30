import path from "node:path";

import {
  createDisputeMessage,
  createDispute,
  deleteResidentDispute,
  getDispute,
  getDisputeEvidenceFile,
  getDisputeHistory,
  listDisputes,
  listDisputeMessages,
  listEligibleDisputeParcels,
  transitionDispute,
  updateAdminResolutionNotes,
  updateGuardResponse,
  updateResidentDispute
} from "../services/dispute.service.js";
import {
  DISPUTE_UPLOAD_DIR,
  removeUploadedFiles
} from "../middleware/upload.middleware.js";

const ERROR_RESPONSES = Object.freeze({
  FORBIDDEN: [403, "You do not have permission to access Dispute Management."],
  INVALID_PARCEL_ID: [400, "Parcel ID format is invalid."],
  PARCEL_NOT_FOUND: [404, "Eligible parcel was not found."],
  INVALID_DISPUTE_ID: [400, "Dispute ID format is invalid."],
  DISPUTE_NOT_FOUND: [404, "Dispute was not found."],
  INVALID_EVIDENCE_ID: [400, "Evidence ID format is invalid."],
  EVIDENCE_NOT_FOUND: [404, "Dispute evidence was not found."],
  INVALID_ISSUE_TYPE: [400, "Issue type is invalid."],
  INVALID_DESCRIPTION: [400, "Description must contain between 10 and 4000 characters."],
  EVIDENCE_LIMIT: [400, "A dispute can include a maximum of 3 evidence images."],
  INVALID_EVIDENCE_SELECTION: [400, "The selected evidence files are invalid."],
  DISPUTE_NOT_OPEN: [409, "Only an open dispute can be edited or deleted."],
  INVALID_MESSAGE: [400, "Message must contain between 1 and 2000 characters."],
  CONVERSATION_READ_ONLY: [409, "The conversation is read-only because this dispute is resolved."],
  INVALID_ASSIGNMENT_FILTER: [400, "Assignment filter is invalid."],
  INVALID_SORT: [400, "Dispute sort option is invalid."],
  INVALID_STATUS: [400, "Dispute status is invalid."],
  INVALID_TRANSITION: [409, "This dispute status transition is not allowed for your role."],
  NOT_ASSIGNED_HANDLER: [403, "Only the currently assigned handler can perform this action."],
  ADMIN_NOTES_FORBIDDEN: [403, "Guards cannot update Admin resolution notes."],
  GUARD_RESPONSE_FORBIDDEN: [403, "Admins cannot update the Guard response."],
  GUARD_RESPONSE_REQUIRED: [400, "Guard response is required."],
  ADMIN_NOTES_REQUIRED: [400, "Admin resolution notes are required."],
  RESPONSE_UPDATE_NOT_ALLOWED: [403, "Guard response can only be updated by the assigned Guard during review."],
  NOTES_UPDATE_NOT_ALLOWED: [403, "Admin notes can only be updated by the responsible Admin." ]
});

function sendResult(res, result, successStatus = 200) {
  if (result.error) {
    const [status, message] = ERROR_RESPONSES[result.error] || [500, "Unable to complete dispute request."];
    return res.status(status).json({ message });
  }

  return res.status(successStatus).json(result);
}

export async function getEligibleParcels(req, res) {
  return sendResult(res, await listEligibleDisputeParcels({
    requester: req.user,
    filters: req.query
  }));
}

export async function createDisputeRecord(req, res) {
  const files = Array.isArray(req.files) ? req.files : [];

  try {
    const result = await createDispute({
      requester: req.user,
      input: req.body,
      files
    });

    if (result.error) {
      await removeUploadedFiles(files);
    }

    return sendResult(res, result, 201);
  } catch (error) {
    await removeUploadedFiles(files);
    throw error;
  }
}

export async function updateResidentDisputeRecord(req, res) {
  const files = Array.isArray(req.files) ? req.files : [];

  try {
    const result = await updateResidentDispute({
      requester: req.user,
      disputeId: req.params.disputeId,
      input: req.body,
      files
    });

    if (result.error) {
      await removeUploadedFiles(files);
      return sendResult(res, result);
    }

    const removedFiles = (result.removed_evidence_filenames || []).map((filename) => ({
      path: path.join(DISPUTE_UPLOAD_DIR, path.basename(filename))
    }));
    await removeUploadedFiles(removedFiles);
    const { removed_evidence_filenames: ignored, ...response } = result;
    return sendResult(res, response);
  } catch (error) {
    await removeUploadedFiles(files);
    throw error;
  }
}

export async function deleteResidentDisputeRecord(req, res) {
  return sendResult(res, await deleteResidentDispute({
    requester: req.user,
    disputeId: req.params.disputeId
  }));
}

export async function listDisputeRecords(req, res) {
  return sendResult(res, await listDisputes({
    requester: req.user,
    filters: req.query
  }));
}

export async function getDisputeRecord(req, res) {
  return sendResult(res, await getDispute({
    requester: req.user,
    disputeId: req.params.disputeId
  }));
}

export async function getDisputeHistoryRecords(req, res) {
  return sendResult(res, await getDisputeHistory({
    requester: req.user,
    disputeId: req.params.disputeId
  }));
}

export async function getDisputeMessageRecords(req, res) {
  return sendResult(res, await listDisputeMessages({
    requester: req.user,
    disputeId: req.params.disputeId,
    filters: req.query
  }));
}

export async function createDisputeMessageRecord(req, res) {
  return sendResult(res, await createDisputeMessage({
    requester: req.user,
    disputeId: req.params.disputeId,
    message: req.body.message
  }), 201);
}

export async function getDisputeEvidence(req, res, next) {
  const result = await getDisputeEvidenceFile({
    requester: req.user,
    disputeId: req.params.disputeId,
    evidenceId: req.params.evidenceId
  });

  if (result.error) {
    return sendResult(res, result);
  }

  const storedFilename = result.evidence.stored_filename;
  if (path.basename(storedFilename) !== storedFilename) {
    return res.status(404).json({ message: "Dispute evidence was not found." });
  }

  res.type(result.evidence.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(result.evidence.original_filename)}"`);
  return res.sendFile(storedFilename, { root: DISPUTE_UPLOAD_DIR }, (error) => {
    if (error && !res.headersSent) {
      next(error);
    }
  });
}

export async function transitionDisputeRecord(req, res) {
  return sendResult(res, await transitionDispute({
    requester: req.user,
    disputeId: req.params.disputeId,
    input: req.body
  }));
}

export async function updateGuardResponseRecord(req, res) {
  return sendResult(res, await updateGuardResponse({
    requester: req.user,
    disputeId: req.params.disputeId,
    response: req.body.guard_response
  }));
}

export async function updateAdminResolutionNotesRecord(req, res) {
  return sendResult(res, await updateAdminResolutionNotes({
    requester: req.user,
    disputeId: req.params.disputeId,
    notes: req.body.admin_resolution_notes
  }));
}
