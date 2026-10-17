import { Building2, Filter, Pencil, Plus, Power, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { ParcelRoomDialog } from "../components/ParcelRoomDialog.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getParcelRooms, setParcelRoomStatus } from "../services/api.js";
import { filterParcelRooms } from "../utils/parcelRooms.js";
import "../styles/parcel-rooms.css";

export function ParcelRoomsPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [pendingRoomId, setPendingRoomId] = useState(null);
  const requestSequence = useRef(0);
  const statusPending = useRef(false);
  const canManage = user?.role === "ADMIN";
  const visibleRooms = useMemo(() => filterParcelRooms(rooms, search, status), [rooms, search, status]);

  const loadRooms = useCallback(async () => {
    if (!canManage) return;
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError("");
    try {
      const result = await getParcelRooms();
      if (sequence !== requestSequence.current) return;
      setRooms(result.parcel_rooms);
      setForbidden(false);
    } catch (requestError) {
      if (sequence !== requestSequence.current) return;
      setForbidden(requestError.status === 403);
      setError(requestError.message);
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadRooms();
    return () => { requestSequence.current += 1; };
  }, [loadRooms]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function handleForbidden(message) {
    setDialog(null);
    setForbidden(true);
    setError(message);
  }
  function handleSaved(room, message) {
    setRooms((current) => [...current.filter((item) => item.id !== room.id), room].sort((a, b) => a.name.localeCompare(b.name)));
    setDialog(null);
    setNotice({ message, type: "success" });
    void loadRooms();
  }
  async function activateRoom(room) {
    if (statusPending.current) return;
    statusPending.current = true;
    setPendingRoomId(room.id);
    try {
      const result = await setParcelRoomStatus(room.id, true);
      handleSaved(result.parcel_room, "Parcel room activated.");
    } catch (requestError) {
      if (requestError.status === 403) handleForbidden(requestError.message);
      else setNotice({ message: requestError.message, type: "error" });
    } finally {
      statusPending.current = false;
      setPendingRoomId(null);
    }
  }
  const addButton = <button className="dark-action-button" type="button" onClick={() => setDialog({ mode: "create" })} disabled={Boolean(pendingRoomId)}><Plus size={17} /> Add Parcel Room</button>;

  return (
    <ProtectedLayout>
      <section className="parcel-rooms-page">
        {canManage && !forbidden && <header className="workspace-page-actions">
          {canManage && !forbidden && addButton}
        </header>}
        {notice && <div className={`parcel-toast ${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
          <span>{notice.message}</span><button type="button" aria-label="Close message" onClick={() => setNotice(null)}><X size={14} /></button>
        </div>}
        {!canManage || forbidden ? (
          <div className="parcel-rooms-state" role="alert"><Building2 size={26} /><h2>Access denied</h2><p>{error || "Parcel Room Management is available only to Admin accounts."}</p></div>
        ) : (
          <>
            <div className="parcel-rooms-toolbar">
              <label className="accounts-search"><Search size={17} /><span className="sr-only">Search room names</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by room name..." />
                {search && <button className="icon-only-button" type="button" aria-label="Clear room search" title="Clear search" onClick={() => setSearch("")}><X size={15} /></button>}
              </label>
              <label className="accounts-status-filter"><Filter size={16} /><span>Status:</span>
                <select aria-label="Room status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
              </label>
              <button className="icon-only-button" type="button" title="Refresh rooms" aria-label="Refresh rooms" disabled={isLoading || Boolean(pendingRoomId)} onClick={loadRooms}><RefreshCw size={17} /></button>
            </div>
            {isLoading ? <div className="parcel-rooms-state" role="status"><Spinner label="Loading parcel rooms" /></div> : error ? (
              <div className="parcel-rooms-state" role="alert"><h2>Unable to load parcel rooms</h2><p>{error}</p><button className="secondary-button" type="button" onClick={loadRooms}><RefreshCw size={16} /> Retry</button></div>
            ) : rooms.length === 0 ? (
              <div className="parcel-rooms-state"><Building2 size={28} /><h2>No parcel rooms yet</h2><p>Create your first parcel room to start organizing parcel storage locations.</p>{addButton}</div>
            ) : visibleRooms.length === 0 ? (
              <div className="parcel-rooms-state"><Search size={26} /><h2>No matching rooms</h2><p>No parcel rooms match the current search and status.</p><button className="secondary-button" type="button" onClick={() => { setSearch(""); setStatus("ALL"); }}>Clear filters</button></div>
            ) : (
              <div className="parcel-rooms-table-wrap">
                <table className="parcel-rooms-table"><caption className="sr-only">Parcel room storage locations</caption>
                  <thead><tr><th scope="col">Room Name</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
                  <tbody>{visibleRooms.map((room) => <tr key={room.id}>
                    <td data-label="Room Name"><strong>{room.name}</strong></td>
                    <td data-label="Description">{room.description || <span className="room-description-empty">Not provided</span>}</td>
                    <td data-label="Status"><span className={`account-status-badge ${room.is_active ? "active" : "inactive"}`}>{room.is_active ? "Active" : "Inactive"}</span></td>
                    <td data-label="Actions"><div className="parcel-room-actions">
                      <button className="icon-only-button" type="button" title="Edit room" aria-label={`Edit ${room.name}`} onClick={() => setDialog({ mode: "edit", room })} disabled={Boolean(pendingRoomId)}><Pencil size={16} /></button>
                      <button className="secondary-button" type="button" aria-label={`${room.is_active ? "Deactivate" : "Activate"} ${room.name}`}
                        onClick={() => room.is_active ? setDialog({ mode: "deactivate", room }) : activateRoom(room)} disabled={Boolean(pendingRoomId)}>
                        {pendingRoomId === room.id ? <Spinner label="Saving" /> : <><Power size={15} />{room.is_active ? "Deactivate" : "Activate"}</>}
                      </button>
                    </div></td>
                  </tr>)}</tbody>
                </table>
                <footer>{visibleRooms.length} of {rooms.length} {rooms.length === 1 ? "room" : "rooms"}</footer>
              </div>
            )}
          </>
        )}
        {dialog && <ParcelRoomDialog key={`${dialog.mode}-${dialog.room?.id || "new"}`} {...dialog} onClose={() => setDialog(null)} onSaved={handleSaved} onForbidden={handleForbidden} />}
      </section>
    </ProtectedLayout>
  );
}
