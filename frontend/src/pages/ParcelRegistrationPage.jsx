import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  ImagePlus,
  Package,
  Search,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiRequest } from "../services/api.js";
import { navigate } from "../utils/navigation.js";

const SCAN_MAX_GAP_MS = 80;
const SCAN_MIN_LENGTH = 5;
const PHONE_COUNTRIES = [
  { code: "+60", flag: "🇲🇾", label: "Malaysia" },
  { code: "+65", flag: "🇸🇬", label: "Singapore" },
  { code: "+86", flag: "🇨🇳", label: "China" },
  { code: "+62", flag: "🇮🇩", label: "Indonesia" },
  { code: "+66", flag: "🇹🇭", label: "Thailand" },
  { code: "+63", flag: "🇵🇭", label: "Philippines" },
  { code: "+84", flag: "🇻🇳", label: "Vietnam" },
  { code: "+95", flag: "🇲🇲", label: "Myanmar" },
  { code: "+855", flag: "🇰🇭", label: "Cambodia" },
  { code: "+856", flag: "🇱🇦", label: "Laos" },
  { code: "+673", flag: "🇧🇳", label: "Brunei" },
  { code: "+880", flag: "🇧🇩", label: "Bangladesh" },
  { code: "+94", flag: "🇱🇰", label: "Sri Lanka" },
  { code: "+92", flag: "🇵🇰", label: "Pakistan" },
  { code: "+91", flag: "🇮🇳", label: "India" },
  { code: "+81", flag: "🇯🇵", label: "Japan" },
  { code: "+82", flag: "🇰🇷", label: "South Korea" },
  { code: "+886", flag: "🇹🇼", label: "Taiwan" },
  { code: "+852", flag: "🇭🇰", label: "Hong Kong" },
  { code: "+971", flag: "🇦🇪", label: "United Arab Emirates" },
  { code: "+61", flag: "🇦🇺", label: "Australia" },
  { code: "+44", flag: "🇬🇧", label: "United Kingdom" },
  { code: "+1", flag: "🇺🇸", label: "United States" }
];

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

function initials(user) {
  const name = displayName(user);

  if (user?.first_name || user?.last_name) {
    return `${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`.toUpperCase();
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function courierCode(courier) {
  return (courier?.courier_code || courier?.short_name || courier?.courier_name?.slice(0, 3) || "COU").toUpperCase();
}

function formatDateTimeParts(date) {
  return {
    date: new Intl.DateTimeFormat("en-MY", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date),
    time: `${new Intl.DateTimeFormat("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short"
    }).format(date)} (UTC+8)`
  };
}

function unitStatusLabel(status) {
  return {
    ACTIVE: "Active",
    PENDING_ACTIVATION: "Pending activation",
    DEACTIVATED: "Deactivated"
  }[status] || "No resident account";
}

function isTextEntryTarget(target) {
  if (!target) {
    return false;
  }

  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function ParcelRegistrationPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [couriers, setCouriers] = useState([]);
  const [isLoadingCouriers, setIsLoadingCouriers] = useState(true);
  const [isCourierDropdownOpen, setIsCourierDropdownOpen] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [deliveryCountryCode, setDeliveryCountryCode] = useState("+60");
  const [isPhoneDropdownOpen, setIsPhoneDropdownOpen] = useState(false);
  const [deliveryPhoneNumber, setDeliveryPhoneNumber] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);

  const [isCourierModalOpen, setIsCourierModalOpen] = useState(false);
  const [courierModalName, setCourierModalName] = useState("");
  const [courierModalCode, setCourierModalCode] = useState("");
  const [courierModalError, setCourierModalError] = useState("");
  const [isSavingCourier, setIsSavingCourier] = useState(false);

  const [unitSearch, setUnitSearch] = useState("");
  const [unitResults, setUnitResults] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);
  const [isSearchingUnits, setIsSearchingUnits] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [parcelFormError, setParcelFormError] = useState("");
  const [sessionParcels, setSessionParcels] = useState([]);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date());
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const courierDropdownRef = useRef(null);
  const phoneDropdownRef = useRef(null);
  const unitDropdownRef = useRef(null);
  const scanBufferRef = useRef("");
  const lastScanKeyAtRef = useRef(0);
  const objectUrlsRef = useRef(new Set());

  const selectedCourier = useMemo(
    () => couriers.find((courier) => courier.courier_id === selectedCourierId),
    [couriers, selectedCourierId]
  );
  const deliveryContact = useMemo(() => {
    const normalizedNumber = deliveryPhoneNumber.replace(/[^\d]/g, "");
    return normalizedNumber ? `${deliveryCountryCode}${normalizedNumber}` : "";
  }, [deliveryCountryCode, deliveryPhoneNumber]);
  const selectedPhoneCountry = useMemo(
    () => PHONE_COUNTRIES.find((country) => country.code === deliveryCountryCode) || PHONE_COUNTRIES[0],
    [deliveryCountryCode]
  );
  const dateTimeParts = useMemo(() => formatDateTimeParts(sessionStartedAt), [sessionStartedAt]);

  function showToast(message, type = "success") {
    setToast({ id: Date.now(), message, type });
  }

  async function loadCouriers() {
    setIsLoadingCouriers(true);
    try {
      const data = await apiRequest("/couriers");
      setCouriers(data.couriers || data.data || []);
    } catch (error) {
      showToast(error.message || "Unable to load courier companies.", "error");
    } finally {
      setIsLoadingCouriers(false);
    }
  }

  useEffect(() => {
    loadCouriers();
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function closeFloatingMenus(event) {
      if (courierDropdownRef.current && !courierDropdownRef.current.contains(event.target)) {
        setIsCourierDropdownOpen(false);
      }

      if (phoneDropdownRef.current && !phoneDropdownRef.current.contains(event.target)) {
        setIsPhoneDropdownOpen(false);
      }

      if (unitDropdownRef.current && !unitDropdownRef.current.contains(event.target)) {
        setIsUnitDropdownOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setIsCourierDropdownOpen(false);
        setIsPhoneDropdownOpen(false);
        setIsUnitDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", closeFloatingMenus);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeFloatingMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !cameraStreamRef.current) {
      return;
    }

    videoRef.current.srcObject = cameraStreamRef.current;
  }, [isCameraOpen, cameraStreamRef.current]);

  useEffect(() => {
    if (step !== 2 || isCourierModalOpen || isFinishModalOpen) {
      return undefined;
    }

    function handleScannerInput(event) {
      if (isTextEntryTarget(event.target)) {
        return;
      }

      if (event.key === "Enter") {
        const scannedValue = scanBufferRef.current.trim();
        scanBufferRef.current = "";

        if (scannedValue.length >= SCAN_MIN_LENGTH) {
          setTrackingNumber(scannedValue);
          showToast("Barcode captured.", "info");
        }

        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const now = Date.now();
      if (now - lastScanKeyAtRef.current > SCAN_MAX_GAP_MS) {
        scanBufferRef.current = "";
      }

      scanBufferRef.current += event.key;
      lastScanKeyAtRef.current = now;
    }

    window.addEventListener("keydown", handleScannerInput);
    return () => window.removeEventListener("keydown", handleScannerInput);
  }, [step, isCourierModalOpen, isFinishModalOpen]);

  useEffect(() => {
    if (step !== 2 || !isUnitDropdownOpen) {
      return undefined;
    }

    const searchTerm = unitSearch.trim();
    const queryText = searchTerm || "-";

    const timer = window.setTimeout(async () => {
      setIsSearchingUnits(true);
      try {
        const data = await apiRequest(`/units/search?search=${encodeURIComponent(queryText)}`);
        setUnitResults(data.units || data.data || []);
      } catch (error) {
        setUnitResults([]);
        showToast(error.message || "Unable to search units.", "error");
      } finally {
        setIsSearchingUnits(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [unitSearch, isUnitDropdownOpen, step]);

  useEffect(() => {
    return () => {
      stopCamera();
      objectUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      objectUrlsRef.current.clear();
    };
  }, []);

  function openCourierModal() {
    setCourierModalName("");
    setCourierModalCode("");
    setCourierModalError("");
    setIsCourierModalOpen(true);
  }

  async function saveCourier(event) {
    event.preventDefault();
    setCourierModalError("");

    if (!courierModalName.trim()) {
      setCourierModalError("Courier company name is required.");
      return;
    }

    setIsSavingCourier(true);
    try {
      const data = await apiRequest("/couriers", {
        method: "POST",
        body: {
          courier_name: courierModalName.trim(),
          courier_code: courierModalCode.trim() || undefined
        }
      });

      const newCourier = data.courier || data.data;
      await loadCouriers();

      if (newCourier?.courier_id) {
        setSelectedCourierId(newCourier.courier_id);
      }

      setIsCourierModalOpen(false);
      showToast("Courier company added.");
    } catch (error) {
      setCourierModalError(error.message || "Unable to add courier company.");
    } finally {
      setIsSavingCourier(false);
    }
  }

  function continueToParcelDetails() {
    setFormError("");

    if (!selectedCourierId) {
      setFormError("Please select a courier company.");
      return;
    }

    if (!deliveryPhoneNumber.trim()) {
      setFormError("Delivery person contact number is required.");
      return;
    }

    setStep(2);
    setSessionStartedAt(new Date());
  }

  function selectUnit(unit) {
    setSelectedUnit(unit);
    setUnitSearch(unit.full_unit_code);
    setUnitResults([]);
    setIsUnitDropdownOpen(false);
    setParcelFormError("");
  }

  async function loadUnitSuggestions(searchText = "-") {
    setIsSearchingUnits(true);
    try {
      const data = await apiRequest(`/units/search?search=${encodeURIComponent(searchText)}`);
      setUnitResults(data.units || data.data || []);
    } catch (error) {
      setUnitResults([]);
      showToast(error.message || "Unable to search units.", "error");
    } finally {
      setIsSearchingUnits(false);
    }
  }

  async function uploadPhotoFile(file, previewUrl) {
    setUploadedPhoto(null);
    setParcelFormError("");
    setIsUploadingPhoto(true);

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const data = await apiRequest("/parcel-registration/photos", {
        method: "POST",
        body: formData
      });
      setPhotoPreviewUrl(previewUrl);
      setUploadedPhoto(data.photo || data);
      showToast("Parcel photo uploaded.");
    } catch (error) {
      setUploadedPhoto(null);
      setParcelFormError(error.message || "Photo upload failed. Please try again.");
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        objectUrlsRef.current.delete(previewUrl);
      }
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      objectUrlsRef.current.delete(photoPreviewUrl);
    }

    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
      objectUrlsRef.current.delete(capturedPhoto.previewUrl);
      setCapturedPhoto(null);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    objectUrlsRef.current.add(nextPreviewUrl);
    await uploadPhotoFile(file, nextPreviewUrl);

    if (isCameraOpen) {
      stopCamera();
      setCapturedPhoto(null);
      setCameraError("");
      setIsCameraOpen(false);
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
  }

  async function openCamera() {
    setCameraError("");
    setCapturedPhoto(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not available in this browser. Please upload an image file instead.");
      setIsCameraOpen(true);
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }
        },
        audio: false
      });
      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
    } catch (error) {
      setCameraError("Camera permission was denied or unavailable. You can still upload an image file.");
      setIsCameraOpen(true);
    }
  }

  function closeCamera() {
    stopCamera();

    if (capturedPhoto?.previewUrl) {
      URL.revokeObjectURL(capturedPhoto.previewUrl);
      objectUrlsRef.current.delete(capturedPhoto.previewUrl);
    }

    setCapturedPhoto(null);
    setCameraError("");
    setIsCameraOpen(false);
  }

  function captureCameraPhoto() {
    const video = videoRef.current;

    if (!video) {
      setCameraError("Camera preview is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("Unable to capture photo. Please try again or upload a file.");
        return;
      }

      if (capturedPhoto?.previewUrl) {
        URL.revokeObjectURL(capturedPhoto.previewUrl);
        objectUrlsRef.current.delete(capturedPhoto.previewUrl);
      }

      const file = new File([blob], `parcel-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      const previewUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.add(previewUrl);
      setCapturedPhoto({ file, previewUrl });
    }, "image/jpeg", 0.9);
  }

  async function useCapturedPhoto() {
    if (!capturedPhoto?.file) {
      setCameraError("Capture a photo first.");
      return;
    }

    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      objectUrlsRef.current.delete(photoPreviewUrl);
    }

    const previewUrl = capturedPhoto.previewUrl;
    setCapturedPhoto(null);
    stopCamera();
    setIsCameraOpen(false);
    await uploadPhotoFile(capturedPhoto.file, previewUrl);
  }

  function clearPhoto({ revoke = true } = {}) {
    if (photoPreviewUrl && revoke) {
      URL.revokeObjectURL(photoPreviewUrl);
      objectUrlsRef.current.delete(photoPreviewUrl);
    }

    setPhotoPreviewUrl("");
    setUploadedPhoto(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function addParcelToSession() {
    setParcelFormError("");
    const normalizedTrackingNumber = trackingNumber.trim();

    if (!selectedUnit) {
      setParcelFormError("Please select an existing unit first.");
      return;
    }

    if (!normalizedTrackingNumber) {
      setParcelFormError("Tracking or barcode number is required.");
      return;
    }

    const isDuplicate = sessionParcels.some(
      (parcel) => parcel.tracking_number.toLowerCase() === normalizedTrackingNumber.toLowerCase()
    );

    if (isDuplicate) {
      setParcelFormError("This tracking number is already in this session.");
      return;
    }

    if (isUploadingPhoto) {
      setParcelFormError("Please wait until the parcel photo finishes uploading.");
      return;
    }

    const nextParcel = {
      localId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${normalizedTrackingNumber}`,
      unit: selectedUnit,
      unit_id: selectedUnit.unit_id,
      tracking_number: normalizedTrackingNumber,
      parcel_photo_url: uploadedPhoto?.parcel_photo_url || null,
      photoPreviewUrl
    };

    setSessionParcels((current) => [...current, nextParcel]);
    setSelectedUnit(null);
    setUnitSearch("");
    setUnitResults([]);
    setTrackingNumber("");
    clearPhoto({ revoke: false });
    showToast("Parcel added to this session.");
  }

  function removeSessionParcel(localId) {
    setSessionParcels((current) => {
      const parcelToRemove = current.find((parcel) => parcel.localId === localId);

      if (parcelToRemove?.photoPreviewUrl) {
        URL.revokeObjectURL(parcelToRemove.photoPreviewUrl);
        objectUrlsRef.current.delete(parcelToRemove.photoPreviewUrl);
      }

      return current.filter((parcel) => parcel.localId !== localId);
    });
  }

  async function finishRegistration() {
    if (sessionParcels.length === 0) {
      showToast("Add at least one parcel before finishing.", "error");
      return;
    }

    setIsFinishing(true);
    try {
      const data = await apiRequest("/parcel-registration/sessions", {
        method: "POST",
        body: {
          courier_id: selectedCourierId,
          delivery_person_contact: deliveryContact,
          parcels: sessionParcels.map((parcel) => ({
            unit_id: parcel.unit_id,
            tracking_number: parcel.tracking_number,
            ...(parcel.parcel_photo_url ? { parcel_photo_url: parcel.parcel_photo_url } : {})
          }))
        }
      });

      sessionParcels.forEach((parcel) => {
        if (parcel.photoPreviewUrl) {
          URL.revokeObjectURL(parcel.photoPreviewUrl);
          objectUrlsRef.current.delete(parcel.photoPreviewUrl);
        }
      });

      setSessionParcels([]);
      setSelectedCourierId("");
      setDeliveryCountryCode("+60");
      setDeliveryPhoneNumber("");
      setStep(1);
      setIsFinishModalOpen(false);
      setSessionStartedAt(new Date());
      showToast(data.message || "Parcels registered successfully.");
    } catch (error) {
      showToast(error.message || "Unable to finish registration.", "error");
    } finally {
      setIsFinishing(false);
    }
  }

  if (user?.role !== "GUARD") {
    return (
      <ProtectedLayout hideTopActions>
        <section className="parcel-registration-page">
          <div className="access-denied-card animate-rise">
            <h1>Access denied</h1>
            <p>Parcel registration is only available for Guard accounts.</p>
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
      <section className="parcel-registration-page">
        {toast && (
          <div className={`parcel-toast ${toast.type}`} role="status">
            <span>{toast.message}</span>
            <button type="button" aria-label="Close message" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <header className="parcel-session-header">
          <button
            className="parcel-back-button"
            type="button"
            onClick={() => (step === 2 ? setStep(1) : navigate("/profile"))}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Log New Parcel</h1>
            <p>
              Guard <ChevronRight size={12} /> Parcels <ChevronRight size={12} /> New session
            </p>
          </div>
        </header>

        <div className="parcel-step-bar">
          <span className={`parcel-step-pill ${step === 1 ? "active" : "complete"}`}>
            <strong>1</strong> Courier info
          </span>
          <i />
          <span className={`parcel-step-pill ${step === 2 ? "active" : ""}`}>
            <strong>2</strong> Parcel details
          </span>
        </div>

        {step === 1 ? (
          <section className="courier-info-stage animate-rise">
            <div className="parcel-stage-heading">
              <h2>Courier Information</h2>
              <p>Enter the courier company and contact number once. This will be used for all parcels registered in this session.</p>
            </div>

            <div className="courier-info-card">
              <div className="courier-select-field" ref={courierDropdownRef}>
                <label className="parcel-field">
                  <span>
                    Courier company <em>*</em>
                  </span>
                  <button
                    className={`courier-select-button ${isCourierDropdownOpen ? "open" : ""}`}
                    type="button"
                    onClick={() => setIsCourierDropdownOpen((current) => !current)}
                  >
                    {selectedCourier ? (
                      <>
                        <b>{courierCode(selectedCourier)}</b>
                        {selectedCourier.courier_name}
                      </>
                    ) : (
                      <small>{isLoadingCouriers ? "Loading couriers..." : "Select Courier Company"}</small>
                    )}
                    <ChevronDown size={18} />
                  </button>
                </label>

                {isCourierDropdownOpen && (
                  <div className="courier-dropdown-panel">
                    {couriers.length === 0 && !isLoadingCouriers ? (
                      <div className="courier-empty-option">No courier companies yet.</div>
                    ) : (
                      couriers.map((courier) => (
                        <button
                          key={courier.courier_id}
                          type="button"
                          onClick={() => {
                            setSelectedCourierId(courier.courier_id);
                            setIsCourierDropdownOpen(false);
                            setFormError("");
                          }}
                        >
                          <b>{courierCode(courier)}</b>
                          {courier.courier_name}
                        </button>
                      ))
                    )}
                    <button className="courier-add-option" type="button" onClick={openCourierModal}>
                      Add New Courier Company
                    </button>
                  </div>
                )}
              </div>

              <label className="parcel-field">
                <span>
                  Delivery person contact number <em>*</em>
                </span>
                <div className="parcel-phone-row" ref={phoneDropdownRef}>
                  <button
                    className={`phone-code-button ${isPhoneDropdownOpen ? "open" : ""}`}
                    type="button"
                    onClick={() => setIsPhoneDropdownOpen((current) => !current)}
                    aria-label="Select country calling code"
                  >
                    <span>{selectedPhoneCountry.flag}</span>
                    <strong>{selectedPhoneCountry.code}</strong>
                    <ChevronDown size={14} />
                  </button>
                  {isPhoneDropdownOpen && (
                    <div className="phone-code-menu">
                      {PHONE_COUNTRIES.map((country) => (
                        <button
                          key={`${country.code}-${country.label}`}
                          type="button"
                          onClick={() => {
                            setDeliveryCountryCode(country.code);
                            setIsPhoneDropdownOpen(false);
                          }}
                        >
                          <span>{country.flag}</span>
                          <strong>{country.code}</strong>
                          <small>{country.label}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    value={deliveryPhoneNumber}
                    onChange={(event) => setDeliveryPhoneNumber(event.target.value)}
                    placeholder="12 345 6789"
                  />
                </div>
              </label>

              {formError && <p className="parcel-form-error">{formError}</p>}

              <div className="courier-info-actions">
                <button className="plain-cancel-button" type="button" onClick={() => navigate("/profile")}>
                  Cancel
                </button>
                <button className="parcel-primary-button" type="button" onClick={continueToParcelDetails}>
                  Continue to parcel details <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="parcel-details-stage animate-rise">
            <div className="parcel-courier-summary">
              <div className="summary-courier">
                <b>{courierCode(selectedCourier)}</b>
                <div>
                  <span>Courier</span>
                  <strong>{selectedCourier?.courier_name}</strong>
                </div>
              </div>
              <div className="summary-contact">
                <span>Contact</span>
                <strong>{deliveryContact}</strong>
              </div>
              <div className="summary-actions">
                <span>
                  <strong>{sessionParcels.length}</strong> parcels in this session
                </span>
                <button type="button" onClick={() => setStep(1)}>
                  <Edit2 size={15} /> Edit
                </button>
              </div>
            </div>

            <div className="parcel-details-grid">
              <article className="parcel-entry-card">
                <h2>Parcel #{sessionParcels.length + 1}</h2>

                <label className="parcel-field unit-search-field" ref={unitDropdownRef}>
                  <span>
                    Unit number <em>*</em>
                  </span>
                  <div className="parcel-input-icon">
                    <Search size={18} />
                    <input
                      value={unitSearch}
                      onFocus={() => {
                        setIsUnitDropdownOpen(true);
                        if (unitResults.length === 0) {
                          loadUnitSuggestions(unitSearch.trim() || "-");
                        }
                      }}
                      onChange={(event) => {
                        setUnitSearch(event.target.value);
                        setIsUnitDropdownOpen(true);
                        if (selectedUnit?.full_unit_code !== event.target.value) {
                          setSelectedUnit(null);
                        }
                      }}
                      placeholder="Search by unit number (e.g. A-12-03)"
                    />
                  </div>
                  {isUnitDropdownOpen && (unitSearch || unitResults.length > 0 || isSearchingUnits) && (
                    <div className="unit-results-panel">
                      {isSearchingUnits ? (
                        <span className="unit-search-status">Searching units...</span>
                      ) : unitResults.length > 0 ? (
                        unitResults.map((unit) => (
                          <button type="button" key={unit.unit_id} onClick={() => selectUnit(unit)}>
                            <strong>{unit.full_unit_code}</strong>
                            <span className={`unit-status-pill ${unit.resident_status || "NONE"}`}>
                              {unitStatusLabel(unit.resident_status)}
                            </span>
                          </button>
                        ))
                      ) : (
                        <span className="unit-search-status">
                          Unit not found. Please ask Admin to create the resident/unit account first.
                        </span>
                      )}
                    </div>
                  )}
                </label>

                <label className="parcel-field">
                  <span>
                    Tracking / Barcode number <em>*</em>
                  </span>
                  <input
                    className="parcel-text-input mono-cell"
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                    placeholder="Type or scan (e.g. SPX9248103742MY)"
                  />
                  <small>Scan barcode or type tracking number manually.</small>
                </label>

                <div className="parcel-field">
                  <span>Parcel photo (optional)</span>
                  <input
                    ref={fileInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    capture="environment"
                    onChange={handlePhotoChange}
                  />
                  <div className={`photo-capture-box ${photoPreviewUrl ? "has-preview" : ""}`}>
                    {photoPreviewUrl ? (
                      <>
                        <img src={photoPreviewUrl} alt="Parcel preview" />
                        <div className="photo-preview-actions">
                          <button type="button" onClick={openCamera}>
                            <Camera size={15} /> Retake
                          </button>
                          <button type="button" onClick={() => fileInputRef.current?.click()}>
                            <ImagePlus size={15} /> Upload
                          </button>
                          <button type="button" onClick={() => clearPhoto()}>
                            <Trash2 size={15} /> Remove
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="photo-choice-panel">
                        <button type="button" onClick={openCamera}>
                          <span>
                            {isUploadingPhoto ? <Spinner label="Uploading" /> : <Camera size={24} />}
                          </span>
                          <strong>Capture parcel photo</strong>
                          <small>Use camera on supported devices</small>
                        </button>
                        <button className="photo-file-button" type="button" onClick={() => fileInputRef.current?.click()}>
                          <UploadCloud size={16} /> Select image file
                        </button>
                      </div>
                    )}
                  </div>
                  {uploadedPhoto?.parcel_photo_url && (
                    <small className="photo-uploaded-note">
                      <Check size={13} /> Photo uploaded and ready.
                    </small>
                  )}
                </div>

                <div className="parcel-field">
                  <span>Date & time logged</span>
                  <div className="date-time-row">
                    <input value={dateTimeParts.date} readOnly />
                    <input value={dateTimeParts.time} readOnly />
                  </div>
                  <small>Read-only. The backend records the official registration time when you finish.</small>
                </div>

                {parcelFormError && <p className="parcel-form-error">{parcelFormError}</p>}

                <div className="parcel-add-row">
                  <small>
                    <Package size={14} /> Fill barcode and unit to add this parcel. Photo is optional.
                  </small>
                  <button className="parcel-secondary-button" type="button" onClick={addParcelToSession}>
                    <Check size={16} /> Add Parcel
                  </button>
                </div>
              </article>

              <aside className="session-panel">
                <header>
                  <h2>Parcels in this session</h2>
                  <span>{sessionParcels.length} logged</span>
                </header>

                <div className="session-parcel-list">
                  {sessionParcels.length === 0 ? (
                    <div className="session-empty-state">
                      <span>
                        <Package size={24} />
                      </span>
                      <strong>No parcels added yet</strong>
                      <p>Add a parcel using the form on the left.</p>
                    </div>
                  ) : (
                    sessionParcels.map((parcel, index) => (
                      <div className="session-parcel-item" key={parcel.localId}>
                        {parcel.photoPreviewUrl ? (
                          <img src={parcel.photoPreviewUrl} alt="" />
                        ) : (
                          <span className="no-photo-thumb">
                            <Package size={18} />
                          </span>
                        )}
                        <div>
                          <strong>
                            Parcel #{index + 1} · {parcel.unit.full_unit_code}
                          </strong>
                          <span>{parcel.tracking_number}</span>
                        </div>
                        <button type="button" onClick={() => removeSessionParcel(parcel.localId)} aria-label="Remove parcel">
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <footer>
                  <p>Residents will be notified after you finish registration.</p>
                  <button
                    className="finish-registration-button"
                    type="button"
                    disabled={sessionParcels.length === 0}
                    onClick={() => setIsFinishModalOpen(true)}
                  >
                    <Check size={16} /> Finish registration
                  </button>
                </footer>
              </aside>
            </div>
          </section>
        )}

        {isCourierModalOpen && (
          <div className="modal-backdrop parcel-modal-backdrop">
            <form className="parcel-small-modal animate-modal" onSubmit={saveCourier}>
              <header>
                <div>
                  <h2>Add New Courier Company</h2>
                  <p>Create a new courier company if it is not in the list.</p>
                </div>
                <button type="button" onClick={() => setIsCourierModalOpen(false)} aria-label="Close modal">
                  <X size={18} />
                </button>
              </header>

              <div className="parcel-small-modal-body">
                <label className="parcel-field">
                  <span>Courier Company Name</span>
                  <input
                    className="parcel-text-input"
                    value={courierModalName}
                    onChange={(event) => setCourierModalName(event.target.value)}
                    placeholder="e.g. Flash Express"
                  />
                </label>
                <label className="parcel-field">
                  <span>Courier Code / Short Name</span>
                  <input
                    className="parcel-text-input"
                    value={courierModalCode}
                    onChange={(event) => setCourierModalCode(event.target.value)}
                    placeholder="e.g. FEX"
                  />
                </label>
                <div className="parcel-modal-info">
                  The courier company will be added to the list and can be selected for future parcel registration.
                </div>
                {courierModalError && <p className="parcel-form-error">{courierModalError}</p>}
              </div>

              <footer>
                <button className="parcel-secondary-button" type="button" onClick={() => setIsCourierModalOpen(false)}>
                  Cancel
                </button>
                <button className="parcel-primary-button compact" type="submit" disabled={isSavingCourier}>
                  {isSavingCourier ? <Spinner label="Adding" /> : <><Check size={16} /> Add Courier Company</>}
                </button>
              </footer>
            </form>
          </div>
        )}

        {isCameraOpen && (
          <div className="modal-backdrop parcel-modal-backdrop">
            <div className="parcel-camera-modal animate-modal">
              <header>
                <div>
                  <h2>Capture parcel photo</h2>
                  <p>Use camera when available, or upload an image file instead.</p>
                </div>
                <button type="button" onClick={closeCamera} aria-label="Close camera">
                  <X size={18} />
                </button>
              </header>

              <div className="camera-preview-area">
                {cameraError ? (
                  <div className="camera-error-state">
                    <Camera size={30} />
                    <strong>Camera unavailable</strong>
                    <p>{cameraError}</p>
                  </div>
                ) : capturedPhoto?.previewUrl ? (
                  <img src={capturedPhoto.previewUrl} alt="Captured parcel" />
                ) : (
                  <video ref={videoRef} autoPlay playsInline muted />
                )}
              </div>

              <footer>
                <button className="parcel-secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud size={16} /> Upload file
                </button>
                {capturedPhoto?.previewUrl ? (
                  <>
                    <button
                      className="parcel-secondary-button"
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(capturedPhoto.previewUrl);
                        objectUrlsRef.current.delete(capturedPhoto.previewUrl);
                        setCapturedPhoto(null);
                      }}
                    >
                      Retake
                    </button>
                    <button className="parcel-primary-button compact" type="button" onClick={useCapturedPhoto} disabled={isUploadingPhoto}>
                      {isUploadingPhoto ? <Spinner label="Uploading" /> : <><Check size={16} /> Use photo</>}
                    </button>
                  </>
                ) : (
                  <button className="parcel-primary-button compact" type="button" onClick={captureCameraPhoto} disabled={Boolean(cameraError)}>
                    <Camera size={16} /> Capture photo
                  </button>
                )}
              </footer>
            </div>
          </div>
        )}

        {isFinishModalOpen && (
          <div className="modal-backdrop parcel-modal-backdrop">
            <div className="finish-session-modal animate-modal">
              <span className="finish-check">
                <Check size={34} />
              </span>
              <h2>Finish this courier session?</h2>
              <p>All parcels below will be saved and residents will be notified later.</p>
              <div className="finish-session-summary">
                {sessionParcels.length} parcel{sessionParcels.length === 1 ? "" : "s"} ready to save
              </div>
              <div className="finish-session-actions">
                <button className="parcel-secondary-button" type="button" onClick={() => setIsFinishModalOpen(false)}>
                  Keep adding
                </button>
                <button className="finish-registration-button" type="button" onClick={finishRegistration} disabled={isFinishing}>
                  {isFinishing ? <Spinner label="Finishing" /> : "Yes, finish & notify"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </ProtectedLayout>
  );
}
