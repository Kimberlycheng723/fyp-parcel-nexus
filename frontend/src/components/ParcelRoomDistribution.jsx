import { Spinner } from "./Spinner.jsx";

export function ParcelRoomDistribution({ data, loading, error, onRetry }) {
  const rows = data || [];
  const total = rows.reduce((sum, room) => sum + room.count, 0);
  const max = Math.max(1, ...rows.map((room) => room.count));
  return (
    <section className="parcel-room-distribution" aria-label="Parcel Distribution by Room" aria-busy={loading}>
      <div className="dashboard-card-heading">
        <div>
          <h2>Parcel Distribution by Room</h2>
          <p>Current pending collection, including overdue parcels</p>
        </div>
        {!loading && !error && <span>{total} pending</span>}
      </div>
      {loading ? <div className="dashboard-loading"><Spinner /><span>Loading room distribution...</span></div>
        : error ? <div className="parcel-room-chart-error" role="alert">
          <span>Unable to load room distribution.</span>
          <button type="button" className="secondary-button" onClick={onRetry}>Retry room distribution</button>
        </div>
        : !data ? <div className="dashboard-empty-state">Room distribution is unavailable.</div>
        : rows.length === 0 ? <div className="dashboard-empty-state">No parcels awaiting collection.</div>
        : <div className="parcel-room-bars" tabIndex={0} aria-label="Pending parcels by room">
          <ul>
            {rows.map((room, index) => <li key={`${room.parcel_room_name}-${index}`}>
              <div className="parcel-room-bar-label"><span>{room.parcel_room_name}</span>
                {room.is_active === false && <small>Inactive</small>}</div>
              <div className="parcel-room-bar-track" aria-hidden="true"><div style={{ width: `${room.count / max * 100}%` }} /></div>
              <strong aria-label={`${room.count} pending parcels`}>{room.count}</strong>
            </li>)}
          </ul>
        </div>}
    </section>
  );
}
