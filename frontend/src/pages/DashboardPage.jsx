import {
  AlertTriangle,
  Bell,
  Check,
  Clock3,
  Package,
  ShieldAlert,
  Users,
  UserCheck,
  Home
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiRequest } from "../services/api.js";
import { navigate } from "../utils/navigation.js";

const PERIODS = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" }
];

const STATUS_COLORS = {
  "Pending Collection": "#f0a51a",
  Overdue: "#d64545",
  Collected: "#2ca866"
};

function roleLabel(role) {
  return {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    GUARD: "Guard",
    RESIDENT: "Resident"
  }[role] || "User";
}

function displayName(user) {
  if (user?.first_name || user?.last_name) {
    return `${user.first_name || ""} ${user.last_name || ""}`.trim();
  }

  return roleLabel(user?.role);
}

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

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
      {!hasData && <div className="dashboard-empty-overlay">No parcel trend data for this period.</div>}
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
        {total === 0 && <div className="dashboard-empty-donut">No parcel status data yet.</div>}
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
    { label: "Units", value: summary.units, extra: `${numberValue(summary.towers)} towers`, icon: Home, tone: "navy" }
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

function ActivityFeed({ activities = [] }) {
  if (activities.length === 0) {
    return <div className="dashboard-empty-state">No recent activity yet.</div>;
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
          {activity.status && <em className={`dashboard-status ${statusLabel(activity.status).toLowerCase().replace(/\s+/g, "-")}`}>{statusLabel(activity.status)}</em>}
          <time>{formatRelativeTime(activity.created_at)}</time>
        </article>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("day");
  const [chartStartDate, setChartStartDate] = useState(getLocalDateInputValue());
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "ADMIN";
  const adminName = displayName(user);

  async function loadDashboard(selectedPeriod, selectedStartDate) {
    if (!isAdmin) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ period: selectedPeriod });

      if (selectedStartDate) {
        params.set("start_date", selectedStartDate);
      }

      const data = await apiRequest(`/dashboard/admin?${params.toString()}`);
      setDashboard(data);
    } catch (requestError) {
      setError(requestError.message || "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard(period, chartStartDate);
  }, [period, chartStartDate, isAdmin]);

  const subtitle = "Here is the condominium parcel operation overview.";
  const overdueCount = numberValue(dashboard?.alert?.overdue_count);
  const chartRangeLabel = useMemo(
    () => formatChartRangeLabel(period, chartStartDate),
    [period, chartStartDate]
  );
  const overdueAlertText =
    overdueCount === 1 ? "1 parcel is overdue." : `${overdueCount} parcels are overdue.`;

  if (!isAdmin) {
    return (
      <ProtectedLayout>
        <section className="dashboard-page">
          <div className="access-denied-card animate-rise">
            <h1>Dashboard not available</h1>
            <p>The analytical dashboard is currently available for Admin accounts only.</p>
            <button className="dark-action-button compact-action" type="button" onClick={() => navigate("/profile")}>
              Back to profile
            </button>
          </div>
        </section>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout hideTopActions>
      <section className="dashboard-page animate-rise">
        <header className="dashboard-header">
          <div>
            <span>OPERATIONS / DASHBOARD</span>
            <h1>
              {greeting()}, {adminName}
            </h1>
            <p>{subtitle}</p>
          </div>
          <div className="dashboard-header-actions">
            <button className="dashboard-bell" type="button" title="Notifications coming later">
              <Bell size={17} />
              <i />
            </button>
          </div>
        </header>

        {error && (
          <div className="dashboard-error" role="alert">
            {error}
          </div>
        )}

        {isLoading && !dashboard ? (
          <div className="dashboard-loading">
            <Spinner />
            <span>Loading dashboard data...</span>
          </div>
        ) : (
          <>
            <div className="dashboard-kpi-grid">
              <KpiCard
                icon={Package}
                tone="blue"
                kpi={dashboard?.kpis?.total_parcels}
                fallbackLabel="Total Parcels"
                displayLabel="Total Parcels"
              />
              <KpiCard
                icon={Clock3}
                tone="amber"
                kpi={dashboard?.kpis?.pending_collection}
                fallbackLabel="Pending Collection"
                displayLabel="Pending Collection"
                meta={`${numberValue(dashboard?.kpis?.pending_collection?.overdue_count)} overdue`}
              />
              <KpiCard
                icon={Check}
                tone="green"
                kpi={dashboard?.kpis?.collected}
                fallbackLabel="Collected"
                displayLabel="Collected"
              />
              <KpiCard
                icon={ShieldAlert}
                tone="red"
                kpi={dashboard?.kpis?.open_disputes}
                fallbackLabel="Open Disputes"
                displayLabel="Open Disputes"
                meta={dashboard?.kpis?.open_disputes?.available === false ? "Module not implemented" : `${numberValue(dashboard?.kpis?.open_disputes?.new_count)} new`}
              />
            </div>

            {overdueCount > 0 && (
              <div className="dashboard-alert">
                <AlertTriangle size={19} />
                <span>{overdueAlertText}</span>
              </div>
            )}

            <div className="dashboard-main-grid">
              <section className="dashboard-card dashboard-trend-card">
                <div className="dashboard-card-heading">
                  <div>
                    <h2>Parcels Received Trend</h2>
                    <p>{chartRangeLabel}</p>
                  </div>
                  <div className="dashboard-trend-filter" aria-label="Parcels received trend filter">
                    <div className="dashboard-period-toggle">
                      {PERIODS.map((option) => (
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
                      aria-label="Trend start date"
                      className="dashboard-date-picker"
                      type="date"
                      value={chartStartDate}
                      onChange={(event) => setChartStartDate(event.target.value || getLocalDateInputValue())}
                    />
                  </div>
                </div>
                <TrendChart data={dashboard?.parcel_trend || []} />
                <div className="dashboard-chart-legend">
                  <span><i className="received" /> Parcels received</span>
                  <span><i className="collected" /> Collected same day</span>
                </div>
              </section>

              <section className="dashboard-card dashboard-status-card">
                <div className="dashboard-card-heading">
                  <div>
                    <h2>Parcel Status Distribution</h2>
                    <p>Current active parcel status</p>
                  </div>
                </div>
                <DonutChart data={dashboard?.status_distribution || []} />
              </section>

              <section className="dashboard-card dashboard-dispute-card">
                <div className="dashboard-card-heading">
                  <div>
                    <h2>Dispute Summary</h2>
                    <p>Current dispute module status</p>
                  </div>
                  <button
                    className="dashboard-card-action"
                    type="button"
                    disabled
                    title="Dispute module is not implemented yet"
                  >
                    View disputes
                  </button>
                </div>
                {dashboard?.dispute_summary?.available ? (
                  <div className="dashboard-dispute-list">
                    {dashboard.dispute_summary.items.map((item) => (
                      <div key={item.status}>
                        <span>{item.status}</span>
                        <strong>{numberValue(item.count)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-empty-state">{dashboard?.dispute_summary?.message || "Dispute module is not implemented yet."}</div>
                )}
              </section>

              <section className="dashboard-card dashboard-system-card-wrap">
                <div className="dashboard-card-heading">
                  <div>
                    <h2>System Summary</h2>
                    <p>Accounts and coverage</p>
                  </div>
                  <button
                    className="dashboard-card-action"
                    type="button"
                    onClick={() => navigate("/accounts")}
                  >
                    Manage accounts
                  </button>
                </div>
                <SystemSummary summary={dashboard?.system_summary || {}} />
              </section>
            </div>

            <section className="dashboard-card dashboard-activity-card">
              <div className="dashboard-card-heading">
                <div>
                  <h2>Recent Activity</h2>
                  <p>Live feed from existing parcel and account records</p>
                </div>
                <button
                  className="dashboard-card-action"
                  type="button"
                  disabled
                  title="Audit Log module is not implemented yet"
                >
                  View audit log
                </button>
              </div>
              <ActivityFeed activities={dashboard?.recent_activity || []} />
            </section>
          </>
        )}
      </section>
    </ProtectedLayout>
  );
}
