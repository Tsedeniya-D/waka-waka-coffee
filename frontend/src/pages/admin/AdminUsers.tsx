import { useState } from 'react'

import { useAuth } from '../../contexts/AuthContext'
import { useDebounce } from '../../hooks'
import { EMPLOYEE_ROLES, roleLabel } from '../../lib/permissions'
import { useUserActions, useUsers } from '../../queries/admin'
import { ErrorState, formatDate, formatDateTime, useConfirm, useFlash } from '../../components/admin/ui'
import type { Profile, UserRole } from '../../types'

const PASSWORD_HINT = 'At least 8 characters, including a letter and a number'

function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter.'
  if (!/\d/.test(password)) return 'Password must contain a number.'
  return null
}

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'sales' as UserRole,
  phone: '',
  job_title: '',
}

export default function AdminUsers() {
  const { profile: me, role: myRole, can } = useAuth()
  const actions = useUserActions()
  const flash = useFlash()
  const { confirm, dialog } = useConfirm()

  const canCreate = can('users', 'create')
  const canUpdate = can('users', 'update')
  const isSuperAdmin = myRole === 'super_admin'

  // super_admin can only be granted by a super admin (API enforces this too).
  const assignableRoles = EMPLOYEE_ROLES.filter((r) => r !== 'super_admin' || isSuperAdmin) as UserRole[]

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const debouncedSearch = useDebounce(search, { delay: 350 })

  const usersQuery = useUsers({
    search: debouncedSearch.trim() || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    sort: '-created_at',
    limit: 500,
  })
  const users = usersQuery.data?.data ?? []

  // Accurate totals independent of the current filters.
  const totalQuery = useUsers({ limit: 1 })
  const activeQuery = useUsers({ status: 'active', limit: 1 })
  const inactiveQuery = useUsers({ status: 'inactive', limit: 1 })

  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [roleDraft, setRoleDraft] = useState<UserRole>('sales')
  const [busyId, setBusyId] = useState<string | null>(null)

  const saving = actions.create.isPending || actions.update.isPending

  function openCreateForm() {
    setEditingUser(null)
    setForm(emptyForm)
    flash.clear()
    setShowForm(true)
  }

  function openEditForm(user: Profile) {
    setEditingUser(user)
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      password: '',
      role: user.role,
      phone: user.phone || '',
      job_title: user.job_title || '',
    })
    setRoleDraft(user.role)
    flash.clear()
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingUser(null)
  }

  async function saveUser() {
    const fullName = form.full_name.trim()
    if (fullName.length < 2) return flash.error(new Error('Full name must be at least 2 characters.'))

    const phone = form.phone.trim() || null
    const jobTitle = form.job_title.trim() || null

    try {
      if (editingUser) {
        await actions.update.mutateAsync({
          id: editingUser.id,
          body: { full_name: fullName, phone, job_title: jobTitle },
        })
        flash.success('User profile updated successfully.')
      } else {
        const email = form.email.trim()
        if (!email) return flash.error(new Error('Email is required.'))
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flash.error(new Error('Please enter a valid email address.'))
        const pwError = passwordProblem(form.password)
        if (pwError) return flash.error(new Error(pwError))
        if (!assignableRoles.includes(form.role)) return flash.error(new Error('Please select a valid role.'))

        const created = await actions.create.mutateAsync({
          email,
          password: form.password,
          full_name: fullName,
          role: form.role,
          phone,
          job_title: jobTitle,
        })
        flash.success(
          `${created.full_name || email} can now sign in with the temporary password as ${roleLabel(created.role)}.`
        )
      }
      closeForm()
    } catch (err) {
      flash.error(err, 'Failed to save user.')
    }
  }

  async function changeRole() {
    if (!editingUser) return
    if (editingUser.id === me?.id) return flash.error(new Error('You cannot change your own role.'))
    if (roleDraft === editingUser.role) return flash.error(new Error('Choose a different role first.'))

    const ok = await confirm({
      title: 'Change role',
      message: `Change ${editingUser.full_name || editingUser.email || 'this user'} from ${roleLabel(
        editingUser.role
      )} to ${roleLabel(roleDraft)}? Their access to modules changes immediately.`,
      confirmLabel: 'Change role',
    })
    if (!ok) return

    try {
      const updated = await actions.setRole.mutateAsync({ id: editingUser.id, role: roleDraft })
      setEditingUser(updated)
      flash.success(`Role changed to ${roleLabel(updated.role)}.`)
    } catch (err) {
      flash.error(err, 'Failed to change role.')
    }
  }

  async function toggleUserStatus(user: Profile) {
    const name = user.full_name || user.email || 'this user'
    if (user.id === me?.id && user.is_active) {
      return flash.error(new Error('You cannot deactivate your own account.'))
    }

    const ok = await confirm(
      user.is_active
        ? {
            title: 'Deactivate account',
            message: `Deactivate ${name}? They are blocked from signing in and lose access to all data immediately, including any session that is currently open. You can reactivate the account later.`,
            confirmLabel: 'Deactivate',
            danger: true,
          }
        : {
            title: 'Activate account',
            message: `Activate ${name}? They can sign in again with their existing password and regain the access of their role (${roleLabel(user.role)}).`,
            confirmLabel: 'Activate',
          }
    )
    if (!ok) return

    setBusyId(user.id)
    try {
      await actions.setActive.mutateAsync({ id: user.id, is_active: !user.is_active })
      flash.success(`${name} has been ${!user.is_active ? 'activated' : 'deactivated'}.`)
    } catch (err) {
      flash.error(err)
    } finally {
      setBusyId(null)
    }
  }

  async function sendReset(user: Profile) {
    if (!user.email) return flash.error(new Error('This account has no email address.'))
    const ok = await confirm({
      title: 'Send password reset email',
      message: `Send a password reset link to ${user.email}? Their current password keeps working until they set a new one.`,
      confirmLabel: 'Send email',
    })
    if (!ok) return

    setBusyId(user.id)
    try {
      const res = await actions.sendPasswordReset.mutateAsync(user.id)
      flash.success(res?.message || `A password reset link was sent to ${user.email}.`)
    } catch (err) {
      flash.error(err, 'Failed to send the reset email.')
    } finally {
      setBusyId(null)
    }
  }

  const editingSelf = Boolean(editingUser && editingUser.id === me?.id)
  const editingProtected = Boolean(editingUser?.role === 'super_admin' && !isSuperAdmin)

  const refreshAll = () => {
    usersQuery.refetch()
    totalQuery.refetch()
    activeQuery.refetch()
    inactiveQuery.refetch()
  }

  return (
    <div className="space-y-6">
      {dialog}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Users
          </h1>

          <p className="text-sm text-gray-500">
            Manage employee profiles, roles, and account status.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshAll}
            disabled={usersQuery.isFetching}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {usersQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Users</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {totalQuery.data?.meta.total ?? '—'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Active Users</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {activeQuery.data?.meta.total ?? '—'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Inactive Users</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {inactiveQuery.data?.meta.total ?? '—'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Search
            </label>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Name, email, or job title..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Role
            </label>

            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            >
              <option value="all">All Roles</option>

              {EMPLOYEE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Status
            </label>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
            >
              <option value="all">All Users</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              {editingUser ? 'Edit User Profile' : 'Add New Employee'}
            </h2>

            {!editingUser ? (
              <p className="mt-1 text-xs text-gray-500">
                Creates the employee's login (email + temporary password) and profile with their operational role.
                Share the temporary password securely; they can change it under Settings.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Update the employee's profile details. Role and account status are changed separately.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Full Name
              </label>

              <input
                type="text"
                value={form.full_name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    full_name: event.target.value,
                  })
                }
                placeholder="e.g. Test Sales"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Email
              </label>

              <input
                type="email"
                value={form.email}
                disabled={Boolean(editingUser)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                placeholder="e.g. sales@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-50 disabled:cursor-not-allowed"
              />
            </div>

            {!editingUser && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Temporary Password
                </label>

                <input
                  type="password"
                  value={form.password}
                  autoComplete="new-password"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      password: event.target.value,
                    })
                  }
                  placeholder={PASSWORD_HINT}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                />
                <p className="mt-1 text-xs text-gray-500">{PASSWORD_HINT}.</p>
              </div>
            )}

            {!editingUser && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Role
                </label>

                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      role: event.target.value as UserRole,
                    })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Phone
              </label>

              <input
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    phone: event.target.value,
                  })
                }
                placeholder="e.g. +251 911 000 000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Job Title
              </label>

              <input
                type="text"
                value={form.job_title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    job_title: event.target.value,
                  })
                }
                placeholder="e.g. Sales Coordinator"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={saveUser}
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : editingUser
                ? 'Save Changes'
                : 'Create User'}
            </button>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {/* Role (separate control) */}
          {editingUser && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-700">Role</h3>
              <p className="mt-1 text-xs text-gray-500">
                Current role: <span className="font-medium text-gray-700">{roleLabel(editingUser.role)}</span>.
                {editingSelf
                  ? ' You cannot change your own role.'
                  : editingProtected
                  ? ' Only a super admin can change a super admin account.'
                  : ' Changing the role changes which modules this person can use, effective immediately.'}
              </p>

              <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                <select
                  value={roleDraft}
                  disabled={editingSelf || editingProtected || !canUpdate}
                  onChange={(event) => setRoleDraft(event.target.value as UserRole)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black disabled:cursor-not-allowed disabled:bg-gray-50 md:w-64"
                >
                  {(assignableRoles.includes(editingUser.role) ? assignableRoles : [editingUser.role, ...assignableRoles]).map(
                    (role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  onClick={changeRole}
                  disabled={
                    editingSelf || editingProtected || !canUpdate || actions.setRole.isPending || roleDraft === editingUser.role
                  }
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actions.setRole.isPending ? 'Updating...' : 'Update Role'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  User
                </th>

                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  Role
                </th>

                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  Status
                </th>

                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  Last Login
                </th>

                <th className="px-6 py-3 text-left font-semibold text-gray-700">
                  Created
                </th>

                <th className="px-6 py-3 text-right font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {usersQuery.isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-gray-500"
                  >
                    Loading users...
                  </td>
                </tr>
              ) : usersQuery.isError ? (
                <tr>
                  <td colSpan={6}>
                    <ErrorState error={usersQuery.error} onRetry={() => usersQuery.refetch()} />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-gray-500"
                  >
                    {search || roleFilter !== 'all' || statusFilter !== 'all'
                      ? 'No users match these filters.'
                      : 'No users found.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSelf = user.id === me?.id
                  const isProtected = user.role === 'super_admin' && !isSuperAdmin
                  const busy = busyId === user.id
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt=""
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
                              {(user.full_name ||
                                user.email ||
                                'U')
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}

                          <div>
                            <div className="font-medium text-gray-900">
                              {user.full_name || 'Unnamed User'}
                              {isSelf && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}
                            </div>

                            <div className="text-xs text-gray-500">
                              {user.email || 'No email'}
                            </div>

                            {(user.job_title || user.phone) && (
                              <div className="text-xs text-gray-400">
                                {[user.job_title, user.phone].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                          {roleLabel(user.role)}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            user.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {user.is_active
                            ? 'Active'
                            : 'Inactive'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {user.last_login_at ? formatDateTime(user.last_login_at) : 'Never'}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {formatDate(user.created_at)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {canUpdate && !isProtected ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openEditForm(user)
                              }
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => sendReset(user)}
                              disabled={busy || !user.email}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Send Password Reset
                            </button>

                            {!(isSelf && user.is_active) && (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleUserStatus(user)
                                }
                                disabled={busy}
                                className={`rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50 ${
                                  user.is_active
                                    ? 'border border-red-200 text-red-600 hover:bg-red-50'
                                    : 'border border-green-200 text-green-600 hover:bg-green-50'
                                }`}
                              >
                                {user.is_active
                                  ? 'Deactivate'
                                  : 'Activate'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {isProtected ? 'Super admin only' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {usersQuery.data && usersQuery.data.meta.total > users.length && (
          <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-500">
            Showing {users.length} of {usersQuery.data.meta.total} users. Narrow the search to find others.
          </p>
        )}
      </div>
    </div>
  )
}
