import {
  AlertTriangle,
  Check,
  Clock3,
  Download,
  FileText,
  Package,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
  Users,
  UserCheck,
  Home,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { ParcelDetailsDialog } from "../components/ParcelDetailsDialog.jsx";
import { ParcelRoomDistribution } from "../components/ParcelRoomDistribution.jsx";
import { AdminDashboardView } from "../components/AdminDashboardView.jsx";
import { useSearchQuery } from '../hooks/useSearchQuery.js';
import { DashboardGreeting, OverdueCaution } from "../components/DashboardStatus.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  apiDownload,
  apiRequest,
  createResidentCollection,
  getResidentParcels,
  getResidentParcelDetails,
  getResidentParcelSummary,
  getParcelRooms
} from "../services/api.js";
import { saveResidentCollectionSession } from "../utils/collectionSession.js";
import { navigate } from "../utils/navigation.js";
import { parcelRoomLabel } from "../utils/parcelRooms.js";
import { adminRangeLabel, malaysiaToday } from "../utils/adminDashboard.js";

const PERIODS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" }
];

const GUARD_PERIODS = [
  { label: "Day", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" }
];

const REPORT_TYPES = [
  {
    label: "Dashboard Summary Report",
    value: "dashboard_summary",
    description: "Summary of dashboard cards, parcel trend, and status distribution."
  },
  {
    label: "Parcel Records Report",
    value: "parcel_records",
    description: "Parcel records registered in the selected period."
  }
];

const REPORT_FORMATS = [
  { label: "CSV", value: "csv" },
  { label: "PDF", value: "pdf" }
];

const STATUS_COLORS = {
  "Pending Collection": "#f0a51a",
  Overdue: "#d64545",
  Collected: "#2ca866"
};

function formatDate(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateInput(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDaysToDate(value, days) {
  const date = parseLocalDateInput(value);

  if (!date) {
    return null;
  }

  date.setDate(date.getDate() + days);
  return date;
}

function addMonthsToDate(value, months) {
  const date = parseLocalDateInput(value);

  if (!date) {
    return null;
  }

  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

function formatShortDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatCompactDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatCompactTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatChartRangeLabel(period, startDate) {
  const start = parseLocalDateInput(startDate);

  if (!start) {
    return "Showing selected range";
  }

  if (period === "week") {
    return `Showing ${formatShortDate(start)} - ${formatShortDate(addDaysToDate(startDate, 6))}`;
  }

  if (period === "month") {
    return `Showing ${formatShortDate(start)} - ${formatShortDate(addMonthsToDate(startDate, 1))}`;
  }

  return `Showing ${formatShortDate(start)}`;
}

function formatOperationalRangeLabel(period, startDate) {
  const start = parseLocalDateInput(startDate);

  if (!start) {
    return "Showing selected period";
  }

  if (period === "week") {
    return `Showing ${formatShortDate(start)} - ${formatShortDate(addDaysToDate(startDate, 6))}`;
  }

  if (period === "month") {
    return `Showing ${formatShortDate(start)} - ${formatShortDate(addMonthsToDate(startDate, 1))}`;
  }

  return `Showing ${formatShortDate(start)}`;
}

function reportRangePreview(period, startDate) {
  const label = adminRangeLabel(period, startDate).replace(/^Showing\s/, "");
  return label || "Select a start date";
}

function reportPeriodHelp(period) {
  if (period === "week") {
    return "Report covers 7 days starting from the selected date.";
  }

  if (period === "month") {
    return "Report covers 1 month starting from the selected date.";
  }

  return "Report covers the selected date only.";
}

function filenameFromDisposition(disposition) {
  if (!disposition) {
    return "";
  }

  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1].replace(/"/g, ""));
  }

  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatRelativeTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function numberValue(value) {
  return Number(value || 0);
}

function formatChange(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}%`;
}

function statusLabel(value) {
  const normalized = String(value || "").toUpperCase();

  if (normalized === "PENDING_COLLECTION" || value === "Pending Collection") {
    return "Pending Collection";
  }

  if (normalized === "OVERDUE" || value === "Overdue") {
    return "Overdue";
  }

  if (normalized === "COLLECTED" || value === "Collected") {
    return "Collected";
  }

  return value || "";
}

function statusClassName(value) {
  return statusLabel(value).toLowerCase().replace(/\s+/g, "-");
}

function KpiCard({ icon: Icon, tone, kpi, fallbackLabel, displayLabel, meta }) {
  const changeText = formatChange(kpi?.change_percent);
  const isPositive = Number(kpi?.change_percent) > 0;
  const isNegative = Number(kpi?.change_percent) < 0;

  return (
    <article className={`dashboard-kpi-card ${tone}`}>
      <div className="dashboard-kpi-label">
        <span>
          <Icon size={15} />
        </span>
        <p>{displayLabel || kpi?.label || fallbackLabel}</p>
      </div>
      <div className="dashboard-kpi-value-row">
        <strong>{numberValue(kpi?.value)}</strong>
        {changeText && (
          <em className={isPositive ? "up" : isNegative ? "down" : ""}>{changeText}</em>
        )}
      </div>
      <div className="dashboard-kpi-meta">
        {kpi?.comparison_label && (
          <span>
            {kpi.comparison_label}
            {kpi.comparison_value !== null && kpi.comparison_value !== undefined ? ` · ${kpi.comparison_value}` : ""}
          </span>
        )}
        {meta && <span>{meta}</span>}
      </div>
    </article>
  );
}

function TrendChart({ data = [] }) {
  const [hovered, setHovered] = useState(null);
  const chartData = data.map((item) => ({
    ...item,
    parcels_received: numberValue(item.parcels_received),
    collected_same_day: numberValue(item.collected_same_day)
  }));
  const hasData = chartData.some((item) => item.parcels_received > 0 || item.collected_same_day > 0);
  const width = 720;
  const height = 270;
  const padding = { top: 18, right: 20, bottom: 38, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...chartData.flatMap((item) => [item.parcels_received, item.collected_same_day]));

  function point(index, key) {
    const x = padding.left + (chartData.length <= 1 ? plotWidth / 2 : (index / (chartData.length - 1)) * plotWidth);
    const y = padding.top + plotHeight - (chartData[index][key] / maxValue) * plotHeight;
    return { x, y };
  }

  function pathFor(key) {
    if (chartData.length === 0) {
      return "";
    }

    return chartData
      .map((_, index) => {
        const { x, y } = point(index, key);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }

  return (
    <div className="dashboard-chart-shell">
      {!hasData && <div className="dashboard-empty-overlay"></div>}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Parcels received trend chart">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid-line" />
              <text x={8} y={y + 4} className="chart-axis-label">
                {Math.round(maxValue * ratio)}
              </text>
            </g>
          );
        })}

        <path d={pathFor("parcels_received")} className="trend-line received" />
        <path d={pathFor("collected_same_day")} className="trend-line collected" />

        {chartData.map((item, index) => {
          const received = point(index, "parcels_received");
          return (
            <g key={`${item.label}-${index}`}>
              <rect
                x={received.x - plotWidth / Math.max(chartData.length, 1) / 2}
                y={padding.top}
                width={plotWidth / Math.max(chartData.length, 1)}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHovered({ item, x: received.x, y: received.y })}
                onMouseLeave={() => setHovered(null)}
              />
              <circle cx={received.x} cy={received.y} r="4" className="trend-point received" />
              <circle cx={point(index, "collected_same_day").x} cy={point(index, "collected_same_day").y} r="3" className="trend-point collected" />
              {index % Math.ceil(chartData.length / 7 || 1) === 0 && (
                <text x={received.x} y={height - 12} textAnchor="middle" className="chart-axis-label">
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="dashboard-chart-tooltip" style={{ left: hovered.x, top: hovered.y }}>
          <strong>{hovered.item.label}</strong>
          <span>Parcels received: {hovered.item.parcels_received}</span>
          <span>Collected same day: {hovered.item.collected_same_day}</span>
        </div>
      )}
    </div>
  );
}

function DonutChart({ data = [] }) {
  const [hovered, setHovered] = useState(null);
  const chartData = ["Pending Collection", "Overdue", "Collected"].map((status) => {
    const item = data.find((entry) => entry.status === status) || {};
    return {
      status,
      count: numberValue(item.count),
      percentage: numberValue(item.percentage),
      color: STATUS_COLORS[status]
    };
  });
  const total = chartData.reduce((sum, item) => sum + item.count, 0);
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="dashboard-donut-layout">
      <div className="dashboard-donut-wrap">
        {total === 0 && <div className="dashboard-empty-donut"></div>}
        <svg viewBox="0 0 210 210" role="img" aria-label="Parcel status distribution donut">
          <circle cx="105" cy="105" r={radius} className="donut-base" />
          {chartData.map((item) => {
            const length = total === 0 ? 0 : (item.count / total) * circumference;
            const segment = (
              <circle
                key={item.status}
                cx="105"
                cy="105"
                r={radius}
                className="donut-segment"
                stroke={item.color}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setHovered(item)}
                onMouseLeave={() => setHovered(null)}
              />
            );
            offset += length;
            return segment;
          })}
        </svg>
        <div className="dashboard-donut-center">
          <span>Total</span>
          <strong>{total}</strong>
          <span>parcels</span>
        </div>
        {hovered && (
          <div className="dashboard-donut-tooltip">
            <strong>{hovered.status}</strong>
            <span>{hovered.count} parcels</span>
            <span>{hovered.percentage}%</span>
          </div>
        )}
      </div>
      <div className="dashboard-donut-legend">
        {chartData.map((item) => (
          <div key={item.status}>
            <i style={{ background: item.color }} />
            <span>{item.status}</span>
            <strong>
              {item.count} ({item.percentage}%)
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemSummary({ summary = {} }) {
  const items = [
    { label: "Active Users", value: summary.active_users, icon: UserCheck, tone: "green" },
    { label: "Guards", value: summary.guards, icon: ShieldAlert, tone: "blue" },
    { label: "Residents", value: summary.residents, icon: Users, tone: "purple" },
    { label: "Units", value: summary.units, extra: `${numberValue(summary.towers)} Blocks`, icon: Home, tone: "navy" }
  ];

  return (
    <div className="dashboard-system-grid">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article className={`dashboard-system-card ${item.tone}`} key={item.label}>
            <span>
              <Icon size={15} />
            </span>
            <strong>{numberValue(item.value)}</strong>
            <p>
              {item.label}
              {item.extra ? ` · ${item.extra}` : ""}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function ActivityFeed({ activities = [], emptyMessage = "No recent activity yet." }) {
  if (activities.length === 0) {
    return <div className="dashboard-empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="dashboard-activity-list">
      {activities.map((activity, index) => (
        <article key={`${activity.type}-${activity.created_at}-${index}`}>
          <span className="dashboard-activity-icon">
            <Package size={15} />
          </span>
          <div>
            <strong>{activity.title}</strong>
            <p>{activity.description}</p>
          </div>
          {activity.status && <em className={`dashboard-status ${statusClassName(activity.status)}`}>{statusLabel(activity.status)}</em>}
          <time>{formatRelativeTime(activity.created_at)}</time>
        </article>
      ))}
    </div>
  );
}

function courierCode(code, name) {
  if (code) {
    return String(code).slice(0, 4).toUpperCase();
  }

  if (!name) {
    return "COU";
  }

  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function courierBadgeStyleFromParcel(parcel) {
  return {
    backgroundColor: parcel?.courier_badge_color || "#EF4444",
    color: parcel?.courier_badge_color === "#F4B400" ? "#111820" : "#fff"
  };
}

function GuardStatusBadge({ status }) {
  return <em className={`dashboard-status guard-status-badge ${statusClassName(status)}`}>{statusLabel(status)}</em>;
}

function GuardCourier({ parcel }) {
  return <span className="guard-courier-name">{parcel?.courier_name || "Unknown courier"}</span>;
}

function GuardUnit({ value }) {
  return <span className="guard-unit-pill">{value || "Not assigned"}</span>;
}

function GuardParcelTable({ type, parcels = [] }) {
  const isLatest = type === "latest";

  if (parcels.length === 0) {
    return (
      <div className="guard-table-empty">
        {isLatest ? "No parcels logged yet." : "No pending collection parcels."}
      </div>
    );
  }

  return (
    <div className="guard-table-responsive">
      <div className="guard-table-wrap">
        <table className={`guard-table ${isLatest ? "latest" : "pending"}`}>
          <thead>
            <tr>
              {isLatest && <th>Tracking Number</th>}
              <th>Unit</th>
              <th>Courier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {parcels.map((parcel) => (
              <tr key={parcel.parcel_id || `${parcel.tracking_number}-${parcel.created_at}`}>
                {isLatest && <td className="guard-tracking-cell" title={parcel.tracking_number || ""}>{parcel.tracking_number || "No tracking number"}</td>}
                <td>
                  <GuardUnit value={parcel.unit_full_code} />
                </td>
                <td>
                  <GuardCourier parcel={parcel} />
                </td>
                <td>
                  <GuardStatusBadge status={parcel.display_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="guard-mobile-list">
        {parcels.map((parcel) => (
          <article className="guard-mobile-card" key={parcel.parcel_id || `${parcel.tracking_number}-${parcel.created_at}-mobile`}>
            <div className="guard-mobile-card-top">
              <strong title={isLatest ? parcel.tracking_number || "" : parcel.unit_full_code || ""}>
                {isLatest ? parcel.tracking_number || "No tracking number" : parcel.unit_full_code || "Not assigned"}
              </strong>
              <GuardStatusBadge status={parcel.display_status} />
            </div>
            <dl>
              {isLatest && (
                <div>
                  <dt>Unit</dt>
                  <dd>{parcel.unit_full_code || "Not assigned"}</dd>
                </div>
              )}
              <div>
                <dt>Courier</dt>
                <dd>{parcel.courier_name || "Unknown courier"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

function GuardSummaryCard({ tone, label, value, helper }) {
  return (
    <article className={`guard-summary-card ${tone}`}>
      <div className="guard-summary-value-row">
        <strong>{numberValue(value)}</strong>
      </div>
      <div className="guard-summary-label"><p>{label}</p></div>
      <small>{helper}</small>
    </article>
  );
}

function GuardDashboard() {
  const [period, setPeriod] = useState("today");
  const [startDate, setStartDate] = useState(getLocalDateInputValue());
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  async function loadGuardDashboard() {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        period,
        start_date: startDate
      });
      const data = await apiRequest(`/dashboard/guard?${params.toString()}`);
      setDashboard(data);
    } catch (requestError) {
      setError(requestError.message || "Unable to load guard dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadGuardDashboard();
  }, [period, startDate]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const operationalRangeLabel = useMemo(
    () => formatOperationalRangeLabel(period, startDate),
    [period, startDate]
  );

  return (
    <ProtectedLayout hideTopActions>
      <section className="dashboard-page guard-dashboard-page animate-rise">
        <DashboardGreeting />

        {toastMessage && (
          <div className="dashboard-toast success" role="status">
            {toastMessage}
          </div>
        )}

        {error && (
          <div className="dashboard-error" role="alert">
            {error}
          </div>
        )}

        {isLoading && !dashboard ? (
          <div className="dashboard-loading">
            <Spinner />
            <span>Loading guard dashboard...</span>
          </div>
        ) : (
          <>
            <section className="guard-action-banner">
              <div>
                <h2>Scan, log, done.</h2>
                <p>Log parcels on arrival and scan collection QR codes to start Resident verification.</p>
              </div>
              <div className="guard-action-buttons">
                <button
                  className="guard-action-button"
                  type="button"
                  onClick={() => navigate("/verify-collection")}
                >
                  / Verify Collection
                </button>
                <button className="guard-action-button" type="button" onClick={() => navigate("/parcels/new")}>
                  <Plus size={15} />
                  Log new parcel
                </button>
              </div>
            </section>

            <section className="guard-period-panel" aria-label="Guard summary period">
              <div>
                <strong>Summary Period</strong>
                <p>{operationalRangeLabel}</p>
              </div>
              <div className="dashboard-trend-filter">
                <div className="dashboard-period-toggle">
                  {GUARD_PERIODS.map((option) => (
                    <button
                      className={period === option.value ? "active" : ""}
                      type="button"
                      key={option.value}
                      onClick={() => setPeriod(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Guard dashboard start date"
                  className="dashboard-date-picker"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value || getLocalDateInputValue())}
                />
              </div>
            </section>

            <div className="guard-summary-grid">
              <GuardSummaryCard
                tone="blue"
                label="Parcels Logged"
                value={dashboard?.summary?.parcels_logged}
                helper="selected period"
              />
              <GuardSummaryCard
                tone="amber"
                label="Pending Collection"
                value={dashboard?.summary?.pending_collection}
                helper="current"
              />
              <GuardSummaryCard
                tone="green"
                label="Collected Parcels"
                value={dashboard?.summary?.collected_parcels}
                helper="selected period"
              />
              <GuardSummaryCard
                tone="red"
                label="Overdue Parcels"
                value={dashboard?.summary?.overdue_parcels}
                helper="current"
              />
            </div>

            <OverdueCaution count={dashboard?.summary?.overdue_over_60_days} />

            <ParcelRoomDistribution data={dashboard?.parcel_room_distribution} loading={isLoading}
              error={error} onRetry={loadGuardDashboard} />

            <div className="guard-dashboard-grid guard-dashboard-single">
              <section className="guard-table-card">
                <div className="guard-table-heading">
                  <div>
                    <h2>Latest parcels logged</h2>
                  </div>
                </div>
                <GuardParcelTable type="latest" parcels={dashboard?.latest_logged_parcels || []} />
              </section>

            </div>

            <section className="guard-dispute-card">
              <div className="guard-dispute-heading">
                <div>
                  <h2>Dispute Summary</h2>
                  <p>Current dispute module status</p>
                </div>
                <button
                  className="guard-dispute-button"
                  type="button"
                  onClick={() => setToastMessage("Dispute Management module will be available in a later step.")}
                >
                  View disputes
                </button>
              </div>
              <div className="guard-dispute-empty">
                {dashboard?.dispute_summary?.message || "Dispute module is not implemented yet."}
              </div>
            </section>
          </>
        )}
      </section>
    </ProtectedLayout>
  );
}

function ResidentSummaryCard({ tone, label, value, helper }) {
  return (
    <article className={`resident-summary-card ${tone}`}>
      <strong>{numberValue(value)}</strong>
      <div><p>{label}</p></div>
      <small>{helper}</small>
    </article>
  );
}

function ResidentCourier({ parcel }) {
  return (
    <span className="resident-courier">
      {parcel?.courier_code && (
        <i style={courierBadgeStyleFromParcel(parcel)}>{courierCode(parcel.courier_code, parcel.courier_name)}</i>
      )}
      <span>{parcel?.courier_name || "Unknown courier"}</span>
    </span>
  );
}

function ResidentStatusBadge({ status }) {
  return <em className={`dashboard-status resident-status ${statusClassName(status)}`}>{statusLabel(status)}</em>;
}

function ResidentParcelList({
  tab,
  parcels,
  selectedParcelIds,
  onToggleParcel,
  onToggleAllVisible,
  isLoading,
  search,
  onView,
  detailsLoading
}) {
  const isPending = tab === "pending";
  const selectableParcelIds = isPending ? parcels.map((parcel) => parcel.parcel_id).filter(Boolean) : [];
  const selectedVisibleCount = selectableParcelIds.filter((parcelId) => selectedParcelIds.includes(parcelId)).length;
  const hasSelectableParcels = selectableParcelIds.length > 0;
  const allVisibleSelected = hasSelectableParcels && selectedVisibleCount === selectableParcelIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  if (isLoading) {
    return (
      <div className="resident-parcel-empty">
        <Spinner />
        <span>Loading parcels...</span>
      </div>
    );
  }

  if (parcels.length === 0) {
    return (
      <div className="resident-parcel-empty">
        {search ? "No parcels match your search." : isPending ? "No pending parcels." : "No collected parcel history."}
      </div>
    );
  }

  return (
    <div className="resident-table-wrap">
      <table className={`resident-parcel-table ${isPending ? "pending" : "history"}`}>
        <thead>
          <tr>
            {isPending && (
              <th aria-label="Select parcels">
                <input
                  ref={selectAllRef}
                  className="resident-select-all-check"
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={!hasSelectableParcels}
                  aria-label={allVisibleSelected ? "Deselect all visible parcels" : "Select all visible parcels"}
                  onChange={onToggleAllVisible}
                />
              </th>
            )}
            <th>Date Registered</th>
            <th>Tracking Number</th>
            <th>Courier</th>
            <th>Status</th>
            {!isPending && <th>Collected At</th>}
          </tr>
        </thead>
        <tbody>
          {parcels.map((parcel) => {
            const checked = selectedParcelIds.includes(parcel.parcel_id);
            const isOverdue = statusLabel(parcel.display_status) === "Overdue";

            return (
              <tr
                className={`${checked ? "selected" : ""} ${isOverdue ? "overdue" : ""}`}
                key={parcel.parcel_id}
              >
                {isPending && (
                  <td>
                    <button
                      className={`resident-row-check ${checked ? "checked" : ""}`}
                      type="button"
                      aria-label={checked ? "Deselect parcel" : "Select parcel"}
                      onClick={() => onToggleParcel(parcel.parcel_id)}
                    >
                      {checked && <Check size={14} />}
                    </button>
                  </td>
                )}
                <td>
                  <strong>{formatCompactDate(parcel.created_at)}</strong>
                  <span>
                    {formatRelativeTime(parcel.created_at)}
                    {formatCompactTime(parcel.created_at) ? ` · ${formatCompactTime(parcel.created_at)}` : ""}
                  </span>
                </td>
                <td className="resident-tracking-cell" title={parcel.tracking_number || ""}>
                  <button className="resident-parcel-detail-link" type="button" onClick={() => onView(parcel)} disabled={detailsLoading}
                    title="View parcel details" aria-label={`View parcel ${parcel.tracking_number || "details"}`}>
                    {parcel.tracking_number || "No tracking number"}
                  </button>
                </td>
                <td>
                  <ResidentCourier parcel={parcel} />
                  <span className="resident-parcel-room">Parcel Room: {parcelRoomLabel(parcel)}</span>
                </td>
                <td>
                  <ResidentStatusBadge status={parcel.display_status} />
                </td>
                {!isPending && (
                  <td>
                    <span>{parcel.collected_at ? formatCompactDate(parcel.collected_at) : "Not recorded"}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="resident-mobile-list">
        {parcels.map((parcel) => {
          const checked = selectedParcelIds.includes(parcel.parcel_id);
          const isOverdue = statusLabel(parcel.display_status) === "Overdue";

          return (
            <article
              className={`${checked ? "selected" : ""} ${isOverdue ? "overdue" : ""}`}
              key={`mobile-${parcel.parcel_id}`}
            >
              {isPending && (
                <button
                  className={`resident-row-check ${checked ? "checked" : ""}`}
                  type="button"
                  aria-label={checked ? "Deselect parcel" : "Select parcel"}
                  onClick={() => onToggleParcel(parcel.parcel_id)}
                >
                  {checked && <Check size={14} />}
                </button>
              )}
              <div className="resident-mobile-card-main">
                <div className="resident-mobile-card-topline">
                  <ResidentCourier parcel={parcel} />
                  <ResidentStatusBadge status={parcel.display_status} />
                </div>
                <button className="resident-parcel-detail-link resident-mobile-tracking" type="button" onClick={() => onView(parcel)} disabled={detailsLoading}
                  title="View parcel details" aria-label={`View parcel ${parcel.tracking_number || "details"}`}>
                  {parcel.tracking_number || "No tracking number"}
                </button>
                <span className="resident-parcel-room">Parcel Room: {parcelRoomLabel(parcel)}</span>
                {!isPending && (
                  <span>Collected: {parcel.collected_at ? formatCompactDate(parcel.collected_at) : "Not recorded"}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ResidentDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useSearchQuery({ setPage });
  const [parcelData, setParcelData] = useState({ items: [], pagination: { page: 1, limit: 10, total: 0, total_pages: 0 } });
  const [selectedParcelIds, setSelectedParcelIds] = useState([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isParcelsLoading, setIsParcelsLoading] = useState(true);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [detailsParcel, setDetailsParcel] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const detailsPendingRef = useRef(false);

  async function viewParcel(parcel) {
    if (detailsPendingRef.current) return;
    detailsPendingRef.current = true;
    setDetailsLoading(true);
    setDetailsError("");
    try {
      const data = await getResidentParcelDetails(parcel.parcel_id);
      setDetailsParcel(data.parcel);
    } catch (requestError) {
      setDetailsError(requestError.message || "Unable to load parcel details. Please try again.");
    } finally {
      detailsPendingRef.current = false;
      setDetailsLoading(false);
    }
  }

  async function loadSummary() {
    setIsSummaryLoading(true);
    setError("");

    try {
      const data = await getResidentParcelSummary();
      setSummary(data);
    } catch (requestError) {
      setError(requestError.message || "Unable to load your parcel summary.");
    } finally {
      setIsSummaryLoading(false);
    }
  }

  async function loadParcels() {
    setIsParcelsLoading(true);
    setError("");

    try {
      const data = await getResidentParcels({
        tab: activeTab,
        search: debouncedSearch,
        page,
        limit: 10
      });
      setParcelData(data);
    } catch (requestError) {
      setError(requestError.message || "Unable to load your parcels.");
    } finally {
      setIsParcelsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 280);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadParcels();
  }, [activeTab, debouncedSearch, page]);

  useEffect(() => {
    setSelectedParcelIds([]);
  }, [activeTab, debouncedSearch]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  function handleTabChange(tab) {
    setActiveTab(tab);
    setPage(1);
  }

  function toggleParcel(parcelId) {
    setSelectedParcelIds((current) =>
      current.includes(parcelId)
        ? current.filter((id) => id !== parcelId)
        : [...current, parcelId]
    );
  }

  const visiblePendingParcelIds = useMemo(() => {
    if (activeTab !== "pending") {
      return [];
    }

    return (parcelData.items || []).map((parcel) => parcel.parcel_id).filter(Boolean);
  }, [activeTab, parcelData.items]);

  useEffect(() => {
    setSelectedParcelIds((current) => current.filter((parcelId) => visiblePendingParcelIds.includes(parcelId)));
  }, [visiblePendingParcelIds]);

  function toggleAllVisibleParcels() {
    if (visiblePendingParcelIds.length === 0) {
      return;
    }

    setSelectedParcelIds((current) => {
      const allVisibleSelected = visiblePendingParcelIds.every((parcelId) => current.includes(parcelId));

      if (allVisibleSelected) {
        return current.filter((parcelId) => !visiblePendingParcelIds.includes(parcelId));
      }

      return Array.from(new Set([...current, ...visiblePendingParcelIds]));
    });
  }

  async function handleGenerateQr() {
    if (selectedParcelIds.length === 0 || isGeneratingQr) {
      return;
    }

    setIsGeneratingQr(true);
    setError("");

    try {
      const response = await createResidentCollection(selectedParcelIds);
      saveResidentCollectionSession({
        resident_id: user.user_id,
        collection: response.collection,
        parcel_ids: selectedParcelIds,
        unit: summary?.unit || null
      });
      navigate("/parcel-collection");
    } catch (requestError) {
      setError(requestError.message || "Unable to generate a collection QR code.");

      if (requestError.status === 404 || requestError.status === 409) {
        await Promise.all([loadSummary(), loadParcels()]);
        setSelectedParcelIds([]);
      }
    } finally {
      setIsGeneratingQr(false);
    }
  }

  const residentProfile = summary?.unit
    ? {
        ...user,
        unit: {
          full_unit_code: summary.unit.unit_full_code
        }
      }
    : user;
  const pendingCount = numberValue(summary?.summary?.pending_collection) + numberValue(summary?.summary?.overdue_parcels);
  const historyCount = numberValue(summary?.summary?.collected_parcels);
  const pagination = parcelData.pagination || {};
  const total = numberValue(pagination.total);
  const limit = numberValue(pagination.limit || 10);
  const start = total === 0 ? 0 : (numberValue(pagination.page || page) - 1) * limit + 1;
  const end = total === 0 ? 0 : Math.min(start + limit - 1, total);

  return (
    <ProtectedLayout profile={residentProfile} hideTopActions>
      <section className="dashboard-page resident-dashboard-page animate-rise">
        <DashboardGreeting />

        {toastMessage && (
          <div className="dashboard-toast success" role="status">
            {toastMessage}
          </div>
        )}

        {error && (
          <div className="dashboard-error" role="alert">
            {error}
          </div>
        )}

        {isSummaryLoading && !summary ? (
          <div className="dashboard-loading">
            <Spinner />
            <span>Loading your parcel dashboard...</span>
          </div>
        ) : (
          <>
            <div className="resident-summary-grid">
              <ResidentSummaryCard
                tone="amber"
                label="Pending Collection"
                value={summary?.summary?.pending_collection}
                helper="awaiting pickup at parcel room"
              />
              <ResidentSummaryCard
                tone="red"
                label="Overdue Parcels"
                value={summary?.summary?.overdue_parcels}
                helper="action needed"
              />
              <ResidentSummaryCard
                tone="green"
                label="Collected Parcels"
                value={summary?.summary?.collected_parcels}
                helper="all-time collected parcels"
              />
            </div>

            <section className="resident-parcels-section">
              <div className="resident-parcels-heading">
                <h2>My Parcels</h2>
                <p>Tick parcels, then generate a QR code for the guard.</p>
              </div>

              <div className="resident-tabs" role="tablist" aria-label="Resident parcel tabs">
                <button
                  className={activeTab === "pending" ? "active" : ""}
                  type="button"
                  onClick={() => handleTabChange("pending")}
                >
                  <Clock3 size={15} />
                  Pending
                  <span>{pendingCount}</span>
                </button>
                <button
                  className={activeTab === "history" ? "active" : ""}
                  type="button"
                  onClick={() => handleTabChange("history")}
                >
                  <Check size={15} />
                  History
                  <span>{historyCount}</span>
                </button>
              </div>

              <label className="resident-search">
                <Search size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by tracking number or courier..."
                />
              </label>

              <ResidentParcelList
                tab={activeTab}
                parcels={parcelData.items || []}
                selectedParcelIds={selectedParcelIds}
                onToggleParcel={toggleParcel}
                onToggleAllVisible={toggleAllVisibleParcels}
                isLoading={isParcelsLoading}
                search={debouncedSearch}
                onView={viewParcel}
                detailsLoading={detailsLoading}
              />
              {detailsLoading && <p role="status" className="resident-detail-status">Loading parcel details...</p>}
              {detailsError && <p role="alert" className="resident-detail-error">{detailsError}</p>}

              <div className="resident-pagination">
                <span>
                  Showing {start}-{end} of {total}
                </span>
                <div>
                  <button
                    type="button"
                    disabled={numberValue(pagination.page || page) <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    ‹
                  </button>
                  <strong>{numberValue(pagination.page || page)}</strong>
                  <button
                    type="button"
                    disabled={numberValue(pagination.page || page) >= numberValue(pagination.total_pages)}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>
            </section>

            {selectedParcelIds.length > 0 && (
              <div className="resident-selected-bar" role="status">
                <div>
                  <strong>{selectedParcelIds.length}</strong>
                  <span>
                    {selectedParcelIds.length === 1 ? "parcel selected" : "parcels selected"} — ready to collect
                  </span>
                </div>
                <div>
                  <button type="button" onClick={() => setSelectedParcelIds([])}>
                    Clear
                  </button>
                  <button className="primary" type="button" onClick={handleGenerateQr} disabled={isGeneratingQr}>
                    <QrCode size={15} />
                    {isGeneratingQr ? "Generating..." : "Generate QR Code"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {detailsParcel && <ParcelDetailsDialog resident parcel={detailsParcel} onClose={() => setDetailsParcel(null)} />}
    </ProtectedLayout>
  );
}

export function DashboardPage({ analytics = false }) {
  const { user } = useAuth();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportType, setReportType] = useState("dashboard_summary");
  const [reportRoomId, setReportRoomId] = useState("");
  const [reportRooms, setReportRooms] = useState([]);
  const [reportRoomsLoading, setReportRoomsLoading] = useState(false);
  const [reportRoomsError, setReportRoomsError] = useState("");
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportPeriod, setReportPeriod] = useState("week");
  const [reportStartDate, setReportStartDate] = useState(malaysiaToday());
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const [toastMessage, setToastMessage] = useState("");


  const isAdmin = user?.role === "ADMIN";
  const isGuard = user?.role === "GUARD";
  const isResident = user?.role === "RESIDENT";

  function openReportModal() {
    setReportError("");
    setIsReportModalOpen(true);
  }

  async function loadReportRooms() {
    setReportRoomsLoading(true);
    setReportRoomsError("");
    try {
      const data = await getParcelRooms();
      setReportRooms(data.parcel_rooms || []);
    } catch (requestError) {
      setReportRoomsError(requestError.message || "Unable to load parcel rooms.");
    } finally {
      setReportRoomsLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin && isReportModalOpen && reportType === "parcel_records") loadReportRooms();
  }, [isAdmin, isReportModalOpen, reportType]);

  function closeReportModal() {
    if (isGeneratingReport) {
      return;
    }

    setReportError("");
    setIsReportModalOpen(false);
  }

  async function handleGenerateReport(event) {
    event.preventDefault();
    if (isGeneratingReport) return;
    setReportError("");
    setIsGeneratingReport(true);

    try {
      const params = new URLSearchParams({
        report_type: reportType,
        format: reportFormat,
        period: reportPeriod,
        start_date: reportStartDate
      });
      if (reportType === "parcel_records" && reportRoomId) params.set("parcel_room_id", reportRoomId);
      const { blob, filename: disposition } = await apiDownload(
        `/dashboard/admin/reports/export?${params.toString()}`
      );
      const filename =
        filenameFromDisposition(disposition) ||
        `parcel-nexus-${reportType}-${reportPeriod}-${reportStartDate}.${reportFormat}`;

      downloadBlob(blob, filename);
      setIsReportModalOpen(false);
      setToastMessage("Report downloaded successfully.");
    } catch (requestError) {
      if (requestError.status === 403) {
        setReportError("Permission denied. Only Admin can generate system reports.");
      } else {
        setReportError(requestError.message || "Report export failed. Please try again.");
      }
    } finally {
      setIsGeneratingReport(false);
    }
  }

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  if (isGuard) {
    return <GuardDashboard />;
  }

  if (isResident) {
    return <ResidentDashboard />;
  }

  if (!isAdmin) {
    return (
      <ProtectedLayout>
        <section className="dashboard-page">
          <div className="access-denied-card animate-rise">
            <h1>Dashboard not available</h1>
            <p>This dashboard is not available for your current role.</p>
            <button className="dark-action-button compact-action" type="button" onClick={() => navigate("/profile")}>
              Back to profile
            </button>
          </div>
        </section>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout hideTopActions dashboardVariant>
      <AdminDashboardView onReport={openReportModal} toast={toastMessage} analytics={analytics} />
        {isReportModalOpen && typeof document !== "undefined" && createPortal((
          <div className="dashboard-modal-overlay workspace-theme-surface" role="presentation">
            <form className="dashboard-report-modal" onSubmit={handleGenerateReport}>
              <div className="dashboard-report-modal-header">
                <div>
                  <h2>Generate System Report</h2>
                  <p>Download a report for the selected period.</p>
                </div>
                <button
                  aria-label="Close report modal"
                  className="dashboard-modal-close"
                  type="button"
                  onClick={closeReportModal}
                  disabled={isGeneratingReport}
                >
                  <X size={18} />
                </button>
              </div>

              {reportError && (
                <div className="dashboard-report-error" role="alert">
                  {reportError}
                </div>
              )}

              <div className="dashboard-report-modal-body">
                <div className="dashboard-report-field">
                  <label>Report Type</label>
                  <div className="dashboard-report-type-list">
                    {REPORT_TYPES.map((option) => (
                      <button type="button"
                        className={`dashboard-report-type ${reportType === option.value ? "active" : ""}`}
                        key={option.value}
                        aria-pressed={reportType === option.value}
                        onClick={() => setReportType(option.value)}
                      >
                        <span>
                          <FileText size={16} />
                        </span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dashboard-report-grid">
                  <div className="dashboard-report-field">
                    <label>Format</label>
                    <div className="dashboard-report-segment">
                      {REPORT_FORMATS.map((option) => (
                        <button
                          className={reportFormat === option.value ? "active" : ""}
                          type="button"
                          key={option.value}
                          onClick={() => setReportFormat(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="dashboard-report-field">
                    <label>Period</label>
                    <div className="dashboard-report-segment">
                      {PERIODS.map((option) => (
                        <button
                          className={reportPeriod === option.value ? "active" : ""}
                          type="button"
                          key={option.value}
                          onClick={() => setReportPeriod(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="dashboard-report-field">
                  <label htmlFor="report-start-date">Start Date</label>
                  <input
                    id="report-start-date"
                    className="dashboard-report-date"
                    type="date"
                    value={reportStartDate}
                    onChange={(event) => setReportStartDate(event.target.value || getLocalDateInputValue())}
                    required
                  />
                  <p>{reportPeriodHelp(reportPeriod)}</p>
                </div>

                <div className="dashboard-report-preview">
                  <span>Range preview</span>
                  <strong>{reportRangePreview(reportPeriod, reportStartDate)}</strong>
                </div>
                {reportType === "parcel_records" && <div className="dashboard-report-field dashboard-report-room-field">
                  <label htmlFor="report-parcel-room">Parcel Room</label>
                  <select id="report-parcel-room" className="dashboard-report-date" value={reportRoomId}
                    onChange={(event) => setReportRoomId(event.target.value)}>
                    <option value="">All Rooms</option>
                    <option value="unassigned">Not Assigned</option>
                    {reportRooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.is_active ? "" : " (inactive)"}</option>)}
                  </select>
                  {reportRoomsLoading && <p role="status">Loading parcel rooms...</p>}
                  {reportRoomsError && <div role="alert"><p>{reportRoomsError}</p>
                    <button className="secondary-button" type="button" onClick={loadReportRooms}>Retry loading rooms</button></div>}
                </div>}
              </div>

              <div className="dashboard-report-modal-footer">
                <button
                  className="dashboard-report-secondary"
                  type="button"
                  onClick={closeReportModal}
                  disabled={isGeneratingReport}
                >
                  Cancel
                </button>
                <button className="dashboard-report-primary" type="submit" disabled={isGeneratingReport}>
                  {isGeneratingReport ? "Generating..." : "Generate Report"}
                </button>
              </div>
            </form>
          </div>
        ), document.body)}
    </ProtectedLayout>
  );
}
