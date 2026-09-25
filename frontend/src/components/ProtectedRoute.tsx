import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'

import type {
  AdminModule,
  AppRole,
} from '../lib/permissions'

type ProtectedRouteProps = {
  children: React.ReactNode
  allowedRoles?: AppRole | AppRole[]
  module?: AdminModule
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  module,
}: ProtectedRouteProps) {
  const {
    isAuthenticated,
    loading,
    role,
    hasRole,
    canAccess,
  } = useAuth()

  const location = useLocation()

  /**
   * IMPORTANT:
   * Do not check the role while authentication/profile
   * information is still loading.
   */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="text-center">
          <div className="text-sm text-stone-600">
            Checking your account...
          </div>
        </div>
      </div>
    )
  }

  /**
   * Not authenticated.
   */
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/admin/login"
        state={{ from: location }}
        replace
      />
    )
  }

  /**
   * Check role only after loading has finished.
   */
  const roleOk = allowedRoles
    ? hasRole(allowedRoles)
    : true

  /**
   * Check module permission.
   */
  const moduleOk = module
    ? canAccess(module)
    : true

  /**
   * Authenticated but not authorized.
   */
  if (!roleOk || !moduleOk) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 p-6">
        <div className="max-w-md w-full bg-white border border-stone-200 p-8 text-center">
          <h1 className="text-xl font-semibold text-stone-900 mb-2">
            Access denied
          </h1>

          <p className="text-sm text-stone-600 mb-1">
            Your account is signed in but does not have permission for this area.
          </p>

          <p className="text-xs text-stone-400">
            Role: {role || 'none'}
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}