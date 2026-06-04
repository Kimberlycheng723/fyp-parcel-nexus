import { pool } from "../db/pool.js";

const VALID_PERIODS = ["day", "week", "month"];

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addCalendarMonths(date, months) {
  const day = date.getDate();
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  result.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return result;
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function calculateChangePercent(currentValue, comparisonValue) {
  if (comparisonValue === null || comparisonValue === undefined) {
    return null;
  }

  if (comparisonValue === 0) {
    return currentValue === 0 ? 0 : null;
  }

  return Number((((currentValue - comparisonValue) / comparisonValue) * 100).toFixed(2));
}

function numberValue(value) {
  return Number(value || 0);
}

function getPeriodConfig(period, { startDate } = {}) {
  const now = new Date();
  const selectedStart = startDate ? parseDateInput(startDate) : null;

  if (startDate && !selectedStart) {
    return { error: "INVALID_START_DATE" };
  }

  if (selectedStart) {
    if (period === "week") {
      return {
        period,
        label: "Selected 7 days",
        start: selectedStart,
        end: addDays(selectedStart, 7),
        previousStart: addDays(selectedStart, -7),
        previousEnd: selectedStart,
        comparisonLabel: "vs previous 7 days",
        trendStep: "1 day",
        trendFormat: "Dy, DD Mon"
      };
    }

    if (period === "month") {
      const end = addCalendarMonths(selectedStart, 1);
      return {
        period,
        label: "Selected month range",
        start: selectedStart,
        end,
        previousStart: addCalendarMonths(selectedStart, -1),
        previousEnd: selectedStart,
        comparisonLabel: "vs previous month",
        trendStep: "1 day",
        trendFormat: "DD Mon"
      };
    }

    return {
      period: "day",
      label: "Selected day",
      start: selectedStart,
      end: addDays(selectedStart, 1),
      previousStart: addDays(selectedStart, -1),
      previousEnd: selectedStart,
      comparisonLabel: "vs previous day",
      trendStep: "1 hour",
      trendFormat: "HH24:00"
    };
  }

  if (period === "week") {
    const start = addDays(now, -6);
    start.setHours(0, 0, 0, 0);
    const previousStart = addDays(start, -7);
    const previousEnd = start;

    return {
      period,
      label: "Last 7 days",
      start,
      end: now,
      previousStart,
      previousEnd,
      comparisonLabel: "vs previous 7 days",
      trendStep: "1 day",
      trendFormat: "Dy, DD Mon"
    };
  }

  if (period === "month") {
    const start = startOfMonth(now);
    const previousStart = addMonths(start, -1);
    const previousEnd = start;

    return {
      period,
      label: "This month",
      start,
      end: now,
      previousStart,
      previousEnd,
      comparisonLabel: "vs previous month",
      trendStep: "1 day",
      trendFormat: "DD Mon"
    };
  }

  const start = startOfDay(now);
  const previousStart = addDays(start, -1);

  return {
    period: "day",
    label: "Today",
    start,
    end: now,
    previousStart,
    previousEnd: start,
    comparisonLabel: "vs yesterday",
    trendStep: "1 hour",
    trendFormat: "HH24:00"
  };
}

async function getRangeParcelCount({ start, end }) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM parcels
      WHERE deleted_at IS NULL
        AND created_at >= $1
        AND created_at < $2
    `,
    [start, end]
  );

  return numberValue(result.rows[0]?.count);
}

async function getRangeCollectedCount({ start, end }) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM parcels
      WHERE deleted_at IS NULL
        AND status = 'COLLECTED'
        AND COALESCE(collected_at, updated_at) >= $1
        AND COALESCE(collected_at, updated_at) < $2
    `,
    [start, end]
  );

  return numberValue(result.rows[0]?.count);
}

async function getCurrentPendingAndOverdue() {
  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
        )::int AS pending_collection,
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
            AND collection_deadline IS NOT NULL
            AND collection_deadline < NOW()
        )::int AS overdue_count
      FROM parcels
      WHERE deleted_at IS NULL
    `
  );

  return {
    pendingCollection: numberValue(result.rows[0]?.pending_collection),
    overdueCount: numberValue(result.rows[0]?.overdue_count)
  };
}

async function tableExists(tableName) {
  const result = await pool.query("SELECT to_regclass($1) AS table_name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function getDisputeKpi({ start, end, previousStart, previousEnd, comparisonLabel }) {
  const disputesAvailable = await tableExists("disputes");

  if (!disputesAvailable) {
    return {
      kpi: {
        label: "Open Disputes",
        available: false,
        value: 0,
        new_count: 0,
        message: "Dispute module is not implemented yet."
      },
      summary: {
        available: false,
        items: [],
        message: "Dispute module is not implemented yet."
      }
    };
  }

  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('OPEN', 'IN_REVIEW', 'ESCALATED'))::int AS open_disputes,
        COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $2)::int AS new_count,
        COUNT(*) FILTER (WHERE created_at >= $3 AND created_at < $4)::int AS previous_new_count,
        COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'IN_REVIEW')::int AS in_review_count,
        COUNT(*) FILTER (WHERE status = 'ESCALATED')::int AS escalated_count,
        COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved_count
      FROM disputes
    `,
    [start, end, previousStart, previousEnd]
  );
  const row = result.rows[0] || {};
  const newCount = numberValue(row.new_count);
  const previousNewCount = numberValue(row.previous_new_count);

  return {
    kpi: {
      label: "Open Disputes",
      available: true,
      value: numberValue(row.open_disputes),
      new_count: newCount,
      comparison_label: comparisonLabel,
      comparison_value: previousNewCount,
      change_percent: calculateChangePercent(newCount, previousNewCount)
    },
    summary: {
      available: true,
      items: [
        { status: "Open", count: numberValue(row.open_count) },
        { status: "In Review", count: numberValue(row.in_review_count) },
        { status: "Escalated", count: numberValue(row.escalated_count) },
        { status: "Resolved", count: numberValue(row.resolved_count) }
      ],
      message: ""
    }
  };
}

async function getParcelTrend(config) {
  const result = await pool.query(
    `
      WITH buckets AS (
        SELECT generate_series(
          $1::timestamptz,
          $2::timestamptz,
          $3::interval
        ) AS bucket_start
      )
      SELECT
        b.bucket_start,
        LEAST(b.bucket_start + $3::interval, $2::timestamptz) AS bucket_end,
        to_char(b.bucket_start, $4) AS label,
        COUNT(DISTINCT received.parcel_id)::int AS parcels_received,
        COUNT(DISTINCT collected.parcel_id)::int AS collected_same_day
      FROM buckets b
      LEFT JOIN parcels received
        ON received.deleted_at IS NULL
       AND received.created_at >= b.bucket_start
       AND received.created_at < LEAST(b.bucket_start + $3::interval, $2::timestamptz)
      LEFT JOIN parcels collected
        ON collected.deleted_at IS NULL
       AND collected.status = 'COLLECTED'
       AND COALESCE(collected.collected_at, collected.updated_at) >= b.bucket_start
       AND COALESCE(collected.collected_at, collected.updated_at) < LEAST(b.bucket_start + $3::interval, $2::timestamptz)
      WHERE b.bucket_start < $2::timestamptz
      GROUP BY b.bucket_start
      ORDER BY b.bucket_start
    `,
    [config.start, config.end, config.trendStep, config.trendFormat]
  );

  return result.rows.map((row) => ({
    label: row.label,
    bucket_start: row.bucket_start,
    bucket_end: row.bucket_end,
    parcels_received: numberValue(row.parcels_received),
    collected_same_day: numberValue(row.collected_same_day)
  }));
}

async function getStatusDistribution() {
  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
            AND (
              collection_deadline IS NULL
              OR collection_deadline >= NOW()
            )
        )::int AS pending_collection,
        COUNT(*) FILTER (
          WHERE status IN ('PENDING', 'PENDING_COLLECTION')
            AND collection_deadline IS NOT NULL
            AND collection_deadline < NOW()
        )::int AS overdue,
        COUNT(*) FILTER (
          WHERE status = 'COLLECTED'
        )::int AS collected
      FROM parcels
      WHERE deleted_at IS NULL
    `
  );
  const pendingCollection = numberValue(result.rows[0]?.pending_collection);
  const overdue = numberValue(result.rows[0]?.overdue);
  const collected = numberValue(result.rows[0]?.collected);
  const total = pendingCollection + overdue + collected;

  function percentage(count) {
    return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
  }

  return [
    {
      status: "Pending Collection",
      count: pendingCollection,
      percentage: percentage(pendingCollection)
    },
    {
      status: "Overdue",
      count: overdue,
      percentage: percentage(overdue)
    },
    {
      status: "Collected",
      count: collected,
      percentage: percentage(collected)
    }
  ];
}

async function getSystemSummary() {
  const result = await pool.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE status = 'ACTIVE') AS active_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'GUARD') AS guards,
        (SELECT COUNT(*)::int FROM users WHERE role = 'RESIDENT') AS residents,
        (SELECT COUNT(*)::int FROM units) AS units,
        (SELECT COUNT(DISTINCT block)::int FROM units WHERE block IS NOT NULL AND block <> '') AS towers
    `
  );
  const row = result.rows[0] || {};

  return {
    active_users: numberValue(row.active_users),
    guards: numberValue(row.guards),
    residents: numberValue(row.residents),
    units: numberValue(row.units),
    towers: numberValue(row.towers)
  };
}

async function getRecentActivity() {
  const result = await pool.query(
    `
      (
        SELECT
          'parcel_logged' AS type,
          'Parcel logged' AS title,
          CONCAT(u.full_unit_code, ' · ', c.courier_name) AS description,
          CASE
            WHEN p.status = 'COLLECTED' THEN 'Collected'
            WHEN p.status IN ('PENDING', 'PENDING_COLLECTION')
              AND p.collection_deadline IS NOT NULL
              AND p.collection_deadline < NOW()
              THEN 'Overdue'
            ELSE 'Pending Collection'
          END AS status,
          p.created_at
        FROM parcels p
        INNER JOIN units u ON u.unit_id = p.unit_id
        INNER JOIN courier_companies c ON c.courier_id = p.courier_id
        WHERE p.deleted_at IS NULL
      )
      UNION ALL
      (
        SELECT
          'account_created' AS type,
          'Account created' AS title,
          CONCAT(COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email), ' · ', role) AS description,
          status,
          created_at
        FROM users
        WHERE role IN ('ADMIN', 'GUARD', 'RESIDENT')
      )
      ORDER BY created_at DESC
      LIMIT 8
    `
  );

  return result.rows.map((row) => ({
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    created_at: row.created_at
  }));
}

export async function getAdminDashboard({ requester, period = "day", startDate }) {
  if (requester.role !== "ADMIN") {
    return { error: "FORBIDDEN" };
  }

  const normalizedPeriod = String(period || "day").trim().toLowerCase();

  if (!VALID_PERIODS.includes(normalizedPeriod)) {
    return { error: "INVALID_PERIOD" };
  }

  const config = getPeriodConfig(normalizedPeriod, { startDate });

  if (config.error) {
    return { error: config.error };
  }
  const [totalParcels, previousTotalParcels, collected, previousCollected, pendingData] = await Promise.all([
    getRangeParcelCount(config),
    getRangeParcelCount({
      start: config.previousStart,
      end: config.previousEnd
    }),
    getRangeCollectedCount(config),
    getRangeCollectedCount({
      start: config.previousStart,
      end: config.previousEnd
    }),
    getCurrentPendingAndOverdue()
  ]);
  const [disputeData, parcelTrend, statusDistribution, systemSummary, recentActivity] = await Promise.all([
    getDisputeKpi({
      start: config.start,
      end: config.end,
      previousStart: config.previousStart,
      previousEnd: config.previousEnd,
      comparisonLabel: config.comparisonLabel
    }),
    getParcelTrend(config),
    getStatusDistribution(),
    getSystemSummary(),
    getRecentActivity()
  ]);

  return {
    period: config.period,
    range: {
      label: config.label,
      start: toIso(config.start),
      end: toIso(config.end)
    },
    comparison_range: {
      start: toIso(config.previousStart),
      end: toIso(config.previousEnd)
    },
    kpis: {
      total_parcels: {
        label:
          normalizedPeriod === "day"
            ? "Total Parcels Today"
            : normalizedPeriod === "week"
              ? "Total Parcels This Week"
              : "Total Parcels This Month",
        value: totalParcels,
        comparison_label: config.comparisonLabel,
        comparison_value: previousTotalParcels,
        change_percent: calculateChangePercent(totalParcels, previousTotalParcels)
      },
      pending_collection: {
        label: "Pending Collection",
        value: pendingData.pendingCollection,
        overdue_count: pendingData.overdueCount,
        comparison_label: config.comparisonLabel,
        comparison_value: null,
        change_percent: null,
        message: "Pending collection is a current operational count, not a historical snapshot."
      },
      collected: {
        label:
          normalizedPeriod === "day"
            ? "Collected Today"
            : normalizedPeriod === "week"
              ? "Collected This Week"
              : "Collected This Month",
        value: collected,
        comparison_label: config.comparisonLabel,
        comparison_value: previousCollected,
        change_percent: calculateChangePercent(collected, previousCollected)
      },
      open_disputes: disputeData.kpi
    },
    alert:
      pendingData.overdueCount > 0
        ? {
            type: "overdue",
            overdue_count: pendingData.overdueCount,
            message:
              pendingData.overdueCount === 1
                ? "1 parcel is overdue."
                : `${pendingData.overdueCount} parcels are overdue.`
          }
        : {
            type: "none",
            overdue_count: 0,
            message: ""
          },
    parcel_trend: parcelTrend,
    status_distribution: statusDistribution,
    dispute_summary: disputeData.summary,
    system_summary: systemSummary,
    recent_activity: recentActivity
  };
}
