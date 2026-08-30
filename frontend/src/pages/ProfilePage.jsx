import { Lock, Pencil, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useResendCooldown } from "../hooks/useResendCooldown.js";
import {
  disableBrowserPushForCurrentBrowser,
  enableBrowserPushForCurrentBrowser,
  hasBrowserPushSubscription
} from "../services/browserPush.js";
import {
  apiRequest,
  getNotificationPreferences,
  requestProfileEmailChange,
  sendPasswordResetLink,
  updateNotificationPreferences
} from "../services/api.js";

const NOTIFICATION_TYPE_DETAILS = {
  PARCEL_ARRIVAL: {
    label: "Parcel Arrival",
    description: "Notifications when a parcel is registered for your unit."
  },
  PARCEL_OVERDUE: {
    label: "Overdue Reminder",
    description: "Notifications when a parcel passes its collection deadline."
  },
  DISPUTE_UPDATED: {
    label: "Dispute Updates",
    description: "Notifications about changes to your disputes."
  },
  PARCEL_COMMUNITY_ALERT: {
    label: "Community Parcel Alerts",
    description: "Privacy-safe alerts when another resident may need help locating a parcel."
  }
};

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
  const [hasPasswordEmailSent, setHasPasswordEmailSent] = useState(false);
  const passwordEmailCooldown = useResendCooldown(60);

  const isResident = profile?.role === "RESIDENT";
  const isSuperAdmin = profile?.role === "SUPER_ADMIN";
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
      const requestedEmail = form.email.trim().toLowerCase();
      const currentEmail = profile.email.trim().toLowerCase();
      const data = await apiRequest("/profile", {
        method: "PUT",
        body: {
          phone_number: form.phone_number,
          first_name: isResident ? form.first_name || null : form.first_name,
          last_name: isResident ? form.last_name || null : form.last_name
        }
      });

      let emailChangeMessage = "";

      if (requestedEmail !== currentEmail) {
        const emailChangeResult = await requestProfileEmailChange(requestedEmail);
        emailChangeMessage = emailChangeResult.unchanged
          ? ""
          : " Verification email sent to the new address. Please confirm it before the registered email changes.";
      }

      setProfile(data.profile);
      setForm(emptyProfileForm(data.profile));
      setIsEditing(false);
      setMessage(`Profile updated successfully.${emailChangeMessage}`);
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

        <NotificationPreferences role={profile?.role} />
      </main>

      {isPasswordModalOpen && (
        <ChangePasswordModal
          email={profile?.email}
          hasSentEmail={hasPasswordEmailSent}
          onEmailSent={() => setHasPasswordEmailSent(true)}
          cooldown={passwordEmailCooldown}
          onClose={() => setIsPasswordModalOpen(false)}
        />
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
        className={readOnly ? "locked-input" : ""}
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

function NotificationPreferences({ role }) {
  const [preferences, setPreferences] = useState([]);
  const [savedPreferences, setSavedPreferences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingPushType, setPendingPushType] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [preferenceError, setPreferenceError] = useState("");

  async function loadPreferences() {
    setIsLoading(true);
    setPreferenceError("");

    try {
      const data = await getNotificationPreferences();
      const rows = data.preferences || [];
      setPreferences(rows);
      setSavedPreferences(rows);
    } catch (requestError) {
      setPreferenceError(requestError.message || "Unable to load notification preferences.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPreferences();
  }, [role]);

  const changedPreferences = preferences.filter((preference) => {
    const saved = savedPreferences.find(
      (item) => item.notification_type === preference.notification_type
    );

    return saved && (
      saved.email_enabled !== preference.email_enabled
      || saved.browser_push_enabled !== preference.browser_push_enabled
    );
  });
  const hasChanges = changedPreferences.length > 0;

  function toggleEmail(notificationType) {
    setPreferences((current) =>
      current.map((preference) =>
        preference.notification_type === notificationType
          ? { ...preference, email_enabled: !preference.email_enabled }
          : preference
      )
    );
    setSaveMessage("");
    setPreferenceError("");
  }

  async function toggleBrowserPush(notificationType) {
    const currentPreference = preferences.find(
      (preference) => preference.notification_type === notificationType
    );

    if (!currentPreference || pendingPushType) {
      return;
    }

    setSaveMessage("");
    setPreferenceError("");

    if (currentPreference.browser_push_enabled) {
      try {
        setPendingPushType(notificationType);
        const currentBrowserSubscribed = await hasBrowserPushSubscription();

        if (!currentBrowserSubscribed) {
          await enableBrowserPushForCurrentBrowser();
          setSaveMessage("Browser Push enabled on this browser.");
          return;
        }
      } catch (requestError) {
        setPreferenceError(requestError.message || "Unable to enable Browser Push.");
        return;
      } finally {
        setPendingPushType("");
      }

      setPreferences((current) =>
        current.map((preference) =>
          preference.notification_type === notificationType
            ? { ...preference, browser_push_enabled: false }
            : preference
        )
      );
      return;
    }

    try {
      setPendingPushType(notificationType);
      await enableBrowserPushForCurrentBrowser();
      setPreferences((current) =>
        current.map((preference) =>
          preference.notification_type === notificationType
            ? { ...preference, browser_push_enabled: true }
            : preference
        )
      );
    } catch (requestError) {
      setPreferenceError(requestError.message || "Unable to enable Browser Push.");
    } finally {
      setPendingPushType("");
    }
  }

  async function savePreferences() {
    if (!hasChanges || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveMessage("");
    setPreferenceError("");

    try {
      const data = await updateNotificationPreferences(
        changedPreferences.map((preference) => ({
          notification_type: preference.notification_type,
          email_enabled: preference.email_enabled,
          browser_push_enabled: preference.browser_push_enabled
        }))
      );
      const rows = data.preferences || [];
      setPreferences(rows);
      setSavedPreferences(rows);
      setSaveMessage("Notification preferences saved.");

      if (rows.every((preference) => !preference.browser_push_enabled)) {
        void disableBrowserPushForCurrentBrowser().catch(() => {});
      }
    } catch (requestError) {
      setPreferenceError(requestError.message || "Unable to save notification preferences.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="settings-card">
      <div className="card-heading">
        <div>
          <h2>Notification Preferences</h2>
          <p>Choose how each notification type reaches you.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="preference-loading">
          <Spinner label="Loading notification preferences" />
        </div>
      ) : preferences.length === 0 ? (
        <div className="preference-loading">No notification preferences are available.</div>
      ) : (
        <div className="typed-preference-list">
          {preferences.map((preference) => {
            const details = NOTIFICATION_TYPE_DETAILS[preference.notification_type] || {
              label: preference.notification_type,
              description: "Notification delivery settings."
            };

            return (
              <article className="typed-preference-row" key={preference.notification_type}>
                <div className="typed-preference-heading">
                  <div>
                    <h3>{details.label}</h3>
                    <p>{details.description}</p>
                  </div>
                </div>

                <div className="preference-channel-grid">
                  <PreferenceChannel
                    label="In-App"
                    enabled
                    required
                  />
                  <PreferenceChannel
                    label="Email"
                    enabled={Boolean(preference.email_enabled)}
                    onToggle={() => toggleEmail(preference.notification_type)}
                  />
                  <PreferenceChannel
                    label="Browser Push"
                    enabled={Boolean(preference.browser_push_enabled)}
                    disabled={pendingPushType === preference.notification_type}
                    onToggle={() => toggleBrowserPush(preference.notification_type)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="preference-card-action">
        {preferenceError && <p className="local-save-message error">{preferenceError}</p>}
        {saveMessage && <p className="local-save-message">{saveMessage}</p>}
        <button
          className="save-preferences-button"
          type="button"
          disabled={!hasChanges || isSaving || isLoading}
          onClick={savePreferences}
        >
          {isSaving ? <Spinner label="Saving" /> : "Save preferences"}
        </button>
      </div>
    </section>
  );
}

function PreferenceChannel({
  label,
  enabled = false,
  required = false,
  disabled = false,
  onToggle
}) {

  return (
    <div className={`preference-channel ${required ? "required" : ""}`}>
      <span>{label}</span>
      {required && <small>Required</small>}
      <button
        className={`toggle ${enabled ? "on" : ""} ${required ? "required" : ""}`}
        type="button"
        disabled={required || disabled}
        aria-pressed={enabled}
        aria-label={required ? `${label} notifications are required` : `Toggle ${label} notifications`}
        onClick={onToggle}
      />
    </div>
  );
}

function ChangePasswordModal({ email, hasSentEmail, onEmailSent, cooldown, onClose }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { secondsRemaining, isCoolingDown, startCooldown } = cooldown;

  async function handleSendEmail() {
    setMessage("");
    setError("");

    if (!email) {
      setError("Registered email is not available for this account.");
      return;
    }

    try {
      setIsLoading(true);
      await sendPasswordResetLink(email);
      onEmailSent();
      setMessage("Password reset link sent to your registered email.");
      startCooldown();
    } catch (requestError) {
      setError(requestError.message);
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
            <p>A password reset link will be sent to your registered email address.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="password-email-panel">
          {email && <span>Registered email: {email}</span>}
          {message && <p className="form-success compact">{message}</p>}
          {error && <p className="form-error compact">{error}</p>}
          <div className="password-email-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              className="save-button"
              type="button"
              onClick={handleSendEmail}
              disabled={isLoading || isCoolingDown}
            >
              {isLoading ? (
                <Spinner label="Sending..." />
              ) : isCoolingDown ? (
                `Resend email in ${secondsRemaining}s`
              ) : hasSentEmail ? (
                "Resend email"
              ) : (
                "Send email"
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
