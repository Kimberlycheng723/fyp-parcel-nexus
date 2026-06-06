import {
  Bell,
  Lock,
  Mail,
  Pencil,
  Phone,
  Save,
  Smartphone,
  X
} from "lucide-react";
import { useEffect, useState } from "react";

import { PasswordField } from "../components/PasswordField.jsx";
import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { apiRequest } from "../services/api.js";

function emptyProfileForm(profile) {
  return {
    email: profile?.email || "",
    phone_number: profile?.phone_number || "",
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || ""
  };
}

function unitLabel(profile) {
  return profile?.unit?.full_unit_code || profile?.unit?.unit_number || "Not assigned";
}

function roleLabel(role) {
  return (role || "ACCOUNT").replace("_", " ");
}

export function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(emptyProfileForm());
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const isResident = profile?.role === "RESIDENT";
  const isNamedRole = profile && profile.role !== "RESIDENT";

  async function loadProfile() {
    setIsLoading(true);
    setError("");

    try {
      const data = await apiRequest("/profile");
      setProfile(data.profile);
      setForm(emptyProfileForm(data.profile));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!form.phone_number.trim()) {
      setError("Phone number is required.");
      return;
    }

    if (isNamedRole && (!form.first_name.trim() || !form.last_name.trim())) {
      setError("First name and last name are required for this role.");
      return;
    }

    try {
      setIsSaving(true);
      const data = await apiRequest("/profile", {
        method: "PUT",
        body: {
          email: form.email,
          phone_number: form.phone_number,
          first_name: isResident ? form.first_name || null : form.first_name,
          last_name: isResident ? form.last_name || null : form.last_name
        }
      });
      setProfile(data.profile);
      setForm(emptyProfileForm(data.profile));
      setIsEditing(false);
      setMessage("Profile updated successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <ProtectedLayout profile={profile}>
        <main className="profile-loading">
          <Spinner label="Loading profile" />
        </main>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout profile={profile}>
      <main className="profile-page animate-rise">
        <div className="page-heading">
          <span>ACCOUNT / PROFILE</span>
          <h1>Profile & Settings</h1>
          <p>Manage your account information and notification preferences.</p>
        </div>

        <section className="settings-card">
          <div className="card-heading">
            <div>
              <h2>{isResident ? "Account Information" : "Personal Information"}</h2>
              <p>Your contact details. Used for parcel notifications and dispute follow-ups.</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => setIsEditing((value) => !value)}>
              {isEditing ? <X size={17} /> : <Pencil size={17} />}
              {isEditing ? "Cancel" : "Edit"}
            </button>
          </div>

          <form onSubmit={handleSave}>
            <div className="profile-grid">
              {!isResident && (
                <>
                  <ProfileInput
                    label="First Name"
                    value={form.first_name}
                    readOnly={!isEditing}
                    onChange={(value) => updateField("first_name", value)}
                  />
                  <ProfileInput
                    label="Last Name"
                    value={form.last_name}
                    readOnly={!isEditing}
                    onChange={(value) => updateField("last_name", value)}
                  />
                </>
              )}

              <ProfileInput
                label="Email"
                value={form.email}
                readOnly={!isEditing}
                onChange={(value) => updateField("email", value)}
              />
              <ProfileInput
                label="Phone Number"
                value={form.phone_number}
                readOnly={!isEditing}
                onChange={(value) => updateField("phone_number", value)}
              />

              {isResident && (
                <ReadOnlyField
                  label="Unit"
                  value={unitLabel(profile)}
                  note="Unit is set by management. Contact the office to request a change."
                  wide
                />
              )}

              {profile?.role === "SUPER_ADMIN" && (
                <ReadOnlyField label="Role" value={roleLabel(profile.role)} wide />
              )}
            </div>

            {message && <p className="form-success compact">{message}</p>}
            {error && <p className="form-error compact">{error}</p>}

            <div className="profile-actions">
              <button className="link-button danger-action" type="button" onClick={() => setIsPasswordModalOpen(true)}>
                <Lock size={15} /> Change password
              </button>

              {isEditing && (
                <button className="save-button" type="submit" disabled={isSaving}>
                  {isSaving ? <Spinner label="Saving" /> : <><Save size={16} /> Save changes</>}
                </button>
              )}
            </div>
          </form>
        </section>

        <NotificationPreferences />
      </main>

      {isPasswordModalOpen && (
        <ChangePasswordModal onClose={() => setIsPasswordModalOpen(false)} />
      )}
    </ProtectedLayout>
  );
}

function ProfileInput({ label, value, readOnly, onChange }) {
  return (
    <label className="profile-field">
      <span>{label}</span>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ReadOnlyField({ label, value, note, wide }) {
  return (
    <div className={`profile-field readonly-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <input value={value} readOnly />
      {note && <small><Lock size={13} /> {note}</small>}
    </div>
  );
}

function NotificationPreferences() {
  const [preferences, setPreferences] = useState({
    email: true,
    inApp: true,
    sms: false
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const items = [
    {
      key: "email",
      icon: Mail,
      label: "Email Notifications",
      description: "Receive notifications via email."
    },
    {
      key: "inApp",
      icon: Bell,
      label: "In-App Notifications",
      description: "Receive notifications within the system."
    },
    {
      key: "sms",
      icon: Smartphone,
      label: "SMS Notifications",
      description: "Receive notifications via SMS. Standard rates may apply."
    }
  ];

  function togglePreference(key) {
    setPreferences((current) => ({
      ...current,
      [key]: !current[key]
    }));
    setHasChanges(true);
    setSaveMessage("");
  }

  function savePreferences() {
    setHasChanges(false);
    setSaveMessage("Preferences saved locally for now.");
  }

  return (
    <section className="settings-card">
      <div className="card-heading">
        <div>
          <h2>Notification Preferences</h2>
          <p>Choose how you want to receive system and parcel notifications.</p>
          <p className="coming-later">Coming later in the Notification/Settings module.</p>
        </div>
      </div>

      <div className="preference-list">
        {items.map((item) => {
          const Icon = item.icon;
          const enabled = preferences[item.key];
          return (
            <div className="preference-row" key={item.label}>
              <span className="preference-icon"><Icon size={18} /></span>
              <div>
                <strong>{item.label}</strong>
                <span className={enabled ? "status-pill on" : "status-pill"}>{enabled ? "ON" : "OFF"}</span>
                <p>{item.description}</p>
              </div>
              <button
                className={`toggle ${enabled ? "on" : ""}`}
                type="button"
                aria-pressed={enabled}
                aria-label={`Toggle ${item.label}`}
                onClick={() => togglePreference(item.key)}
              />
            </div>
          );
        })}
      </div>

      <div className="preference-card-action">
        {saveMessage && <p className="local-save-message">{saveMessage}</p>}
        <button className="save-preferences-button" type="button" disabled={!hasChanges} onClick={savePreferences}>
          Save preferences
        </button>
      </div>
    </section>
  );
}

function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    try {
      setIsLoading(true);
      await apiRequest("/profile/change-password", {
        method: "POST",
        body: { currentPassword, newPassword }
      });
      setMessage("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError.errors?.join(" ") || requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="password-modal animate-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <div className="modal-heading">
          <div>
            <h2 id="change-password-title">Change password</h2>
            <p>Use a strong password that you do not use elsewhere.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <PasswordField
            id="current-password"
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <PasswordField
            id="profile-new-password"
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <PasswordField
            id="profile-confirm-password"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          <p className="password-guidance">
            Password must contain at least 8 characters, uppercase and lowercase letters, a number,
            and a special character.
          </p>
          {message && <p className="form-success compact">{message}</p>}
          {error && <p className="form-error compact">{error}</p>}
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? <Spinner label="Changing" /> : "Change password"}
          </button>
        </form>
      </section>
    </div>
  );
}
