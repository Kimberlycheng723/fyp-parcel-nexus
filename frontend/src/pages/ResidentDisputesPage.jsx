import { AlertCircle, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { getDisputes } from "../services/api.js";
import { navigate } from "../utils/navigation.js";
import {
  disputeIssueLabel,
  disputeStatusLabel,
  formatMalaysiaDate
} from "../utils/disputes.js";

const PAGE_LIMIT = 10;
const STATUS_TABS = Object.freeze([
  { key: "ALL", label: "All", status: "" },
  { key: "OPEN", label: "Open", status: "OPEN" },
  { key: "IN_REVIEW_GUARD", label: "In Review (Guard)", status: "IN_REVIEW_GUARD" },
  { key: "ESCALATED", label: "Escalated", status: "ESCALATED" },
  { key: "IN_REVIEW_ADMIN", label: "In Review (Admin)", status: "IN_REVIEW_ADMIN" },
  { key: "RESOLVED", label: "Resolved", status: "RESOLVED" }
]);

function DisputeStatus({ status }) {
  return <span className={`dispute-status status-${status.toLowerCase()}`}>{disputeStatusLabel(status)}</span>;
}

export function ResidentDisputesPage() {
  const [activeTab, setActiveTab] = useState(STATUS_TABS[0]);
  const [disputes, setDisputes] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDisputes = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const currentRequest = getDisputes({
        status: activeTab.status,
        page,
        limit: PAGE_LIMIT
      });
      const countRequests = STATUS_TABS.map((tab) => {
        if (tab.key === activeTab.key && page === 1) return currentRequest;
        return getDisputes({ status: tab.status, page: 1, limit: 1 });
      });
      const [currentData, countData] = await Promise.all([
        currentRequest,
        Promise.all(countRequests)
      ]);

      setDisputes(currentData.disputes || []);
      setPagination(currentData.pagination || { page, total: 0, total_pages: 0 });
      setCounts(Object.fromEntries(
        STATUS_TABS.map((tab, index) => [tab.key, Number(countData[index]?.pagination?.total || 0)])
      ));
    } catch (requestError) {
      setError(requestError.message || "Unable to load your disputes.");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    void loadDisputes();
  }, [loadDisputes]);

  function selectTab(tab) {
    setActiveTab(tab);
    setPage(1);
  }

  function openDispute(disputeId) {
    navigate(`/disputes/${disputeId}`);
  }

  const firstRow = pagination.total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const lastRow = Math.min(page * PAGE_LIMIT, Number(pagination.total || 0));

  return (
    <ProtectedLayout>
      <section className="resident-disputes-page animate-rise">
        <header className="disputes-page-header">
          <div>
            <span>ACCOUNT / DISPUTES</span>
            <h1>My Disputes</h1>
            <p>Track and view your parcel dispute history.</p>
          </div>
          <button className="dispute-primary-button" type="button" onClick={() => navigate("/disputes/new")}>
            <Plus size={17} /> Raise a Dispute
          </button>
        </header>

        <nav className="dispute-tabs" aria-label="Dispute status filters">
          {STATUS_TABS.map((tab) => (
            <button
              className={activeTab.key === tab.key ? "active" : ""}
              type="button"
              aria-pressed={activeTab.key === tab.key}
              onClick={() => selectTab(tab)}
              key={tab.key}
            >
              {tab.label} <span>{counts[tab.key] || 0}</span>
            </button>
          ))}
        </nav>

        {error && (
          <div className="dispute-message error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button type="button" onClick={loadDisputes}><RefreshCw size={15} /> Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="disputes-state"><Spinner label="Loading disputes..." /></div>
        ) : disputes.length === 0 ? (
          <div className="disputes-state empty">
            <AlertCircle size={25} />
            <strong>{activeTab.key === "ALL" ? "No disputes raised yet." : `No ${activeTab.label.toLowerCase()} disputes.`}</strong>
            {activeTab.key === "ALL" && <span>Parcel-related issues you report will appear here.</span>}
          </div>
        ) : (
          <>
            <div className="resident-disputes-table-wrap">
              <table className="resident-disputes-table">
                <thead>
                  <tr>
                    <th>Date Raised</th>
                    <th>Tracking Number</th>
                    <th>Courier</th>
                    <th>Issue Type</th>
                    <th>Status</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((dispute) => (
                    <tr tabIndex={0} onClick={() => openDispute(dispute.dispute_id)} onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") openDispute(dispute.dispute_id);
                    }} key={dispute.dispute_id}>
                      <td>{formatMalaysiaDate(dispute.created_at)}</td>
                      <td><strong title={dispute.parcel.tracking_number}>{dispute.parcel.tracking_number}</strong></td>
                      <td>{dispute.parcel.courier_name}</td>
                      <td>{disputeIssueLabel(dispute.issue_type)}</td>
                      <td><DisputeStatus status={dispute.status} /></td>
                      <td><ChevronRight size={17} aria-hidden="true" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="resident-dispute-card-list">
              {disputes.map((dispute) => (
                <button type="button" className="resident-dispute-card" onClick={() => openDispute(dispute.dispute_id)} key={dispute.dispute_id}>
                  <span className="resident-dispute-card-top">
                    <strong>{dispute.dispute_reference}</strong>
                    <DisputeStatus status={dispute.status} />
                  </span>
                  <span className="resident-dispute-card-tracking">{dispute.parcel.tracking_number}</span>
                  <span className="resident-dispute-card-detail"><b>Courier</b>{dispute.parcel.courier_name}</span>
                  <span className="resident-dispute-card-detail"><b>Issue</b>{disputeIssueLabel(dispute.issue_type)}</span>
                  <span className="resident-dispute-card-date">Raised {formatMalaysiaDate(dispute.created_at)}</span>
                </button>
              ))}
            </div>

            <footer className="dispute-list-footer">
              <span>Showing <strong>{firstRow}–{lastRow}</strong> of {pagination.total} disputes</span>
              <nav aria-label="Dispute pages">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  <ChevronLeft size={16} /> Previous
                </button>
                <strong>{page}</strong>
                <button type="button" disabled={page >= Number(pagination.total_pages || 1)} onClick={() => setPage((current) => current + 1)}>
                  Next <ChevronRight size={16} />
                </button>
              </nav>
            </footer>
          </>
        )}
      </section>
    </ProtectedLayout>
  );
}
