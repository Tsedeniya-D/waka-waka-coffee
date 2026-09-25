import { useState } from 'react'
import { Link } from 'react-router-dom'

import { authApi } from '../../api'
import { useAuth, type AuthProfile } from '../../contexts/AuthContext'
import { API_URL } from '../../lib/api'
import { roleLabel } from '../../lib/permissions'
import { useApiMutation, useUnreadCount } from '../../queries/admin'
import { formatDateTime, useFlash } from '../../components/admin/ui'

function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'The new password must be at least 8 characters.'
  if (!/[A-Za-z]/.test(password)) return 'The new password must contain a letter.'
  if (!/\d/.test(password)) return 'The new password must contain a number.'
  return null
}

const NOTIFICATION_RULES: { event: string; recipients: string }[] = [
  { event: 'New quote request, sample request or contact message from the website', recipients: 'Sales' },
  { event: 'Sales order sent to Export', recipients: 'Export Managers' },
  {
    event: 'Export acceptance, shipment status updates and new shipment documents',
    recipients: "The order's salesperson",
  },
  { event: 'Quality inspection results (lot approved / rejected)', recipients: 'Field Officers & Warehouse Officers' },
]

export default function AdminSettings() {
  const { profile, refreshProfile } = useAuth()
  const flash = useFlash()

  if (!profile) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-sm text-gray-500">
          Loading settings...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account and review how the system notifies you.
        </p>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Profile — keyed so the form resets when the saved profile changes */}
      <ProfileSection
        key={`${profile.id}-${profile.updated_at}`}
        profile={profile}
        refreshProfile={refreshProfile}
        flash={flash}
      />

      {/* Notifications */}
      <NotificationsSection />

      {/* Security */}
      <SecuritySection email={profile.email} flash={flash} />

      {/* System Information */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
            System Information
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Information about the Waka Coffee management system and your session.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoItem
            label="Application"
            value="Waka Coffee Export Management"
          />

          <InfoItem
            label="API URL"
            value={API_URL}
          />

          <InfoItem
            label="Account Role"
            value={roleLabel(profile.role)}
          />

          <InfoItem
            label="Account Status"
            value={profile.is_active ? 'Active' : 'Inactive'}
          />

          <InfoItem
            label="Last Login"
            value={profile.last_login_at ? formatDateTime(profile.last_login_at) : 'Not recorded'}
          />

          <InfoItem
            label="Signed in as"
            value={profile.email || '—'}
          />
        </div>
      </div>
    </div>
  )
}

type Flash = ReturnType<typeof useFlash>

function ProfileSection({
  profile,
  refreshProfile,
  flash,
}: {
  profile: AuthProfile
  refreshProfile: () => Promise<void>
  flash: Flash
}) {
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [jobTitle, setJobTitle] = useState(profile.job_title || '')

  const updateMe = useApiMutation(
    (body: { full_name: string; phone: string | null; job_title: string | null }) => authApi.updateMe(body),
    []
  )

  async function saveProfile() {
    const name = fullName.trim()
    if (name.length < 2) return flash.error(new Error('Full name must be at least 2 characters.'))

    try {
      await updateMe.mutateAsync({
        full_name: name,
        phone: phone.trim() || null,
        job_title: jobTitle.trim() || null,
      })
      await refreshProfile()
      flash.success('Profile information saved successfully.')
    } catch (err) {
      flash.error(err, 'Failed to save profile.')
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          My Profile
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Update your personal information. Your email and role are managed by an administrator.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Full Name
          </label>

          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Email
          </label>

          <input
            type="email"
            value={profile.email || ''}
            disabled
            className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Phone
          </label>

          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +251 911 000 000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Job Title
          </label>

          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Export Coordinator"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Role
          </label>

          <input
            type="text"
            value={roleLabel(profile.role)}
            disabled
            className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Account Status
          </label>

          <div className="flex h-[42px] items-center">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                profile.is_active
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {profile.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={saveProfile}
          disabled={updateMe.isPending}
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateMe.isPending ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}

function NotificationsSection() {
  const { canAccess } = useAuth()
  const unread = useUnreadCount()
  const canSeeNotifications = canAccess('notifications')

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          In-app notifications are sent automatically by the system when these events happen. They are not
          configurable per user.
        </p>
      </div>

      <div className="space-y-5">
        {NOTIFICATION_RULES.map((rule) => (
          <div key={rule.event} className="flex items-start justify-between gap-4">
            <p className="text-sm text-gray-900">
              {rule.event}
            </p>

            <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              {rule.recipients}
            </span>
          </div>
        ))}
      </div>

      {canSeeNotifications && (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-gray-700">
            {unread.isLoading
              ? 'Checking unread notifications...'
              : unread.isError
              ? 'Could not load your unread count.'
              : `You have ${unread.data?.unread ?? 0} unread notification${unread.data?.unread === 1 ? '' : 's'}.`}
          </p>

          <Link
            to="/admin/notifications"
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            View Notifications
          </Link>
        </div>
      )}
    </div>
  )
}

function SecuritySection({ email, flash }: { email: string | null; flash: Flash }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const changePassword = useApiMutation(
    (v: { current: string; next: string }) => authApi.changePassword(v.current, v.next),
    []
  )
  const requestReset = useApiMutation((address: string) => authApi.requestReset(address, `${window.location.origin}/admin/reset-password`), [])

  async function submitPasswordChange() {
    if (!currentPassword) return flash.error(new Error('Enter your current password.'))
    const problem = passwordProblem(newPassword)
    if (problem) return flash.error(new Error(problem))
    if (newPassword !== confirmPassword) return flash.error(new Error('The new passwords do not match.'))
    if (newPassword === currentPassword) return flash.error(new Error('The new password must be different from the current one.'))

    try {
      await changePassword.mutateAsync({ current: currentPassword, next: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      flash.success('Your password has been changed.')
    } catch (err) {
      flash.error(err, 'Failed to change password.')
    }
  }

  async function sendResetLink() {
    if (!email) return flash.error(new Error('Your email address could not be found.'))
    try {
      await requestReset.mutateAsync(email)
      flash.success(`A password reset link has been sent to ${email}.`)
    } catch (err) {
      flash.error(err, 'Failed to send password reset email.')
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Security
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account password.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submitPasswordChange()
        }}
        className="rounded-lg border border-gray-200 p-4"
      >
        <p className="text-sm font-medium text-gray-900">
          Change Password
        </p>
        <p className="mt-1 text-sm text-gray-500">
          At least 8 characters, including a letter and a number.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            type="submit"
            disabled={changePassword.isPending}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {changePassword.isPending ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Forgot your current password?
          </p>

          <p className="mt-1 text-sm text-gray-500">
            We will email a secure reset link to {email || 'your email address'}.
          </p>
        </div>

        <button
          type="button"
          onClick={sendResetLink}
          disabled={requestReset.isPending}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {requestReset.isPending ? 'Sending...' : 'Email Me a Reset Link'}
        </button>
      </div>
    </div>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 break-all text-sm font-medium text-gray-900">
        {value}
      </p>
    </div>
  )
}
