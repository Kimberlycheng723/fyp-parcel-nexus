import PDFDocument from 'pdfkit';
import { getAdminAnalytics } from './adminAnalytics.service.js';
import { REPORT_TYPES } from '../utils/adminAnalytics.js';

const ink = '#1d2a4b', muted = '#526487', line = '#e3e8f1', blue = '#3260d7', green = '#218060', rose = '#be405a';
const number = value => Number(value || 0).toLocaleString('en-MY', { maximumFractionDigits: 1 });
const duration = value => {
  if (value === null) return 'Not recorded';
  const amount = value < 24 ? value : value / 24, unit = value < 24 ? 'hour' : 'day';
  return number(amount) + ' ' + unit + (Math.round(amount * 10) / 10 === 1 ? '' : 's');
};
const dateTime = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export async function generateAnalyticsReport({ requester, filters = {} }) {
  const type = filters.report_type ?? 'full';
  if (!Object.hasOwn(REPORT_TYPES, type) || typeof type !== 'string') return { error: 'INVALID_REPORT_TYPE' };
  const data = await getAdminAnalytics({ requester, filters });
  if (data.error) return data;
  const content = await renderAnalyticsPdf(data, type);
  return { content, filename: `gems-${type}-report-${data.range.from}-to-${data.range.to}.pdf` };
}

export function renderAnalyticsPdf(data, type = 'full') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: REPORT_TYPES[type], Author: 'GEMS Parcel Management' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const width = doc.page.width - 84;
    function text(value, x, y, size = 10, color = ink, options = {}) {
      doc.fillColor(color).font('Helvetica').fontSize(size).text(String(value), x, y, { width, lineBreak: false, ...options });
    }
    function page(section, first = false) {
      if (!first) doc.addPage();
      text('GEMS', 42, 36, 12, blue); text(REPORT_TYPES[type], 42, 62, 22);
      text(`${data.range.from} to ${data.range.to} | ${data.room.name}`, 42, 94, 10, muted, { lineBreak: true, height: 28, ellipsis: true });
      text(section, 42, 128, 13); doc.moveTo(42, 150).lineTo(42 + width, 150).strokeColor(line).stroke();
    }
    function heading(title, subtitle, y) { text(title, 42, y, 14); text(subtitle, 42, y + 23, 9, muted, { width, lineBreak: true, height: 30 }); }
    function chart(title, subtitle, rows, field, y, { horizontal = false, color = blue, asLine = false, decimals = false } = {}) {
      heading(title, subtitle, y);
      const left = horizontal ? 182 : 76, top = y + 65, plotWidth = 42 + width - left - 25, height = horizontal ? rows.length * 29 : 155;
      const observed = Math.max(decimals ? 1 : 4, ...rows.map(row => Number(row[field]) || 0));
      const max = decimals ? observed : Math.ceil(observed / 4) * 4;
      if (horizontal) {
        rows.forEach((row, index) => {
          const rowY = top + index * 29;
          text(row.label, 42, rowY + 3, 9, muted, { width: 134, ellipsis: true });
          const barWidth = Number(row[field] || 0) / max * (plotWidth - 30);
          if (barWidth) doc.roundedRect(left, rowY, barWidth, 16, 2).fill(color);
          text(number(row[field]), left + barWidth + 6, rowY + 3, 9, ink, { width: 35 });
        });
      } else {
        for (let tick = 0; tick <= 4; tick++) {
          const gridY = top + height - tick / 4 * height;
          doc.moveTo(left, gridY).lineTo(left + plotWidth, gridY).lineWidth(.5).strokeColor(line).stroke();
          text(number(max * tick / 4), 42, gridY - 4, 8, muted, { width: 28, align: 'right' });
        }
        let previous = null;
        rows.forEach((row, index) => {
          const step = plotWidth / Math.max(1, rows.length), x = left + step * (index + .5), value = row[field];
          const pointY = top + height - Number(value || 0) / max * height;
          if (value !== null && value !== undefined) {
            if (asLine) {
              if (previous) doc.moveTo(previous[0], previous[1]).lineTo(x, pointY).lineWidth(1.8).strokeColor(color).stroke();
              doc.circle(x, pointY, 2).fill(color); previous = [x, pointY];
            } else {
              const barWidth = Math.min(42, step * .62);
              if (value) doc.roundedRect(x - barWidth / 2, pointY, barWidth, top + height - pointY, 2).fill(color);
              if (rows.length <= 8) text(number(value), x - step / 2, pointY - 13, 8, ink, { width: step, align: 'center' });
            }
          } else previous = null;
          if (index % Math.max(1, Math.ceil(rows.length / 6)) === 0 || index === rows.length - 1) text(row.label, x - 30, top + height + 10, 7, muted, { width: 60, align: 'center', ellipsis: true });
        });
      }
      if (!rows.some(row => row[field] !== null && Number(row[field]) > 0)) text(decimals ? 'No timing samples recorded for this period.' : 'No records for this period.', left, top + height / 2, 10, muted, { width: plotWidth, align: 'center' });
    }
    function facts(rows, y) {
      rows.forEach(([label, value], index) => {
        const rowY = y + index * 32;
        text(label, 42, rowY, 10, muted, { width: width - 135 }); text(value, 42 + width - 130, rowY, 11, ink, { width: 130, align: 'right' });
        doc.moveTo(42, rowY + 22).lineTo(42 + width, rowY + 22).lineWidth(.5).strokeColor(line).stroke();
      });
    }
    let first = true;
    if (type === 'full' || type === 'parcels') {
      page('Parcel registration', first); first = false;
      chart('Parcel Registration Trends', `${data.group === 'week' ? 'Weekly' : data.group === 'month' ? 'Monthly' : 'Daily'} totals; partial boundary periods use selected dates only.`, data.registration_trend, 'registered', 175, { asLine: true });
      chart('Parcel Registration Hours', 'Registration time in Malaysia (24-hour clock).', data.registration_hours, 'registered', 465);
      page('Parcel collection');
      chart('Parcel Collection Hours', 'Collections completed in the selected period, by Malaysia time.', data.collection_hours, 'count', 175, { color: green });
      chart('Time from Notification to Collection', 'Average hours from the first recorded arrival notification to collection, by collection date.', data.collection_delay.series, 'average_hours', 465, { asLine: true, color: green, decimals: true });
      page('Collection performance');
      chart('Overdue Parcel Duration', `Full days past the deadline; uncollected at the selected period end (${data.range.to}).`, data.overdue_duration, 'count', 175, { horizontal: true, color: rose });
      heading('Parcel Collection Rate', 'Parcels registered AND collected within the selected period / all parcels registered in that period.', 465);
      facts([['Collection rate', data.parcel_summary.collection_rate === null ? 'No registrations' : number(data.parcel_summary.collection_rate) + '%'], ['Registered in period', number(data.parcel_summary.registered)], ['Collected within period (same registrations)', number(data.parcel_summary.cohort_collected)], ['Not collected within period (same registrations)', number(data.parcel_summary.cohort_uncollected)]], 530);
    }
    if (type === 'full' || type === 'disputes') {
      page('Dispute analysis', first); first = false;
      chart('Disputes by Issue Type', 'Disputes reported in the selected period.', data.dispute_issues, 'count', 175, { horizontal: true, color: blue });
      chart('Dispute Resolution Time', 'Time from report to resolution; cases resolved in the selected period.', data.dispute_resolution, 'count', 465, { horizontal: true, color: green });
      page('Dispute summary');
      facts([['Disputes reported in period', number(data.dispute_summary.reported)], ['Disputes resolved in period', number(data.dispute_summary.resolved)], ['Unresolved at period end', number(data.dispute_summary.unresolved)], ['Average resolution time', duration(data.dispute_summary.average_resolution_hours)]], 180);
    }
    if (type === 'full' || type === 'system') {
      page('System summary and data coverage', first);
      heading('Current System Summary', 'Building-wide account and room counts as of report generation; not historical or room-filtered.', 175);
      facts([['Active residents', number(data.system_summary.active_residents)], ['Active guards', number(data.system_summary.active_guards)], ['Residents awaiting activation', number(data.system_summary.residents_awaiting_activation)], ['Guards awaiting activation', number(data.system_summary.guards_awaiting_activation)], ['Active parcel rooms', number(data.system_summary.active_rooms)], ['Inactive parcel rooms', number(data.system_summary.inactive_rooms)]], 235);
      heading('Data Coverage', 'Parcel timing coverage follows the selected room and period.', 475);
      facts([['Collections without arrival notification time', number(data.collection_delay.missing_notification)], ['Collected parcels without collection time (to period end)', number(data.parcel_summary.missing_collection_time)], ['Notification-to-collection timing samples', number(data.collection_delay.samples)], ['Average notification-to-collection time', duration(data.collection_delay.average_hours)]], 530);
    }
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      text('Generated ' + dateTime(data.as_of) + ' MYT', 42, 785, 8, muted, { width: width - 80 });
      text(`${index + 1} / ${pages.count}`, 42 + width - 65, 785, 8, muted, { width: 65, align: 'right' });
    }
    doc.end();
  });
}
