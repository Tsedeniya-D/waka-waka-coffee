import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'

import { AUTH_STORAGE_KEY, supabase, isSupabaseConfigured } from '../lib/supabase'
import { ApiError } from '../lib/api'
import { authApi } from '../api'
import type { Permissions, Profile } from '../types'

import {
  can,
  canAccessModule,
  hasRole,
  isAdminRole,
  type AdminModule,
  type AppRole,
  type PermissionAction,
} from '../lib/permissions'

export type AuthProfile = Profile

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: AuthProfile | null
  permissions: Permissions | null
  role: string | null
  loading: boolean
  isAuthenticated: boolean
  isConfigured: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<AuthProfile>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  hasRole: (allowed: AppRole | AppRole[]) => boolean
  canAccess: (module: AdminModule) => boolean
  can: (module: AdminModule, action?: PermissionAction) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** 30-minute inactivity timeout */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000
const LAST_ACTIVE_KEY = 'waka_admin_last_active'

function getLastActiveTime(): number {
  if (typeof window === 'undefined') return Date.now()
  const val = window.sessionStorage.getItem(LAST_ACTIVE_KEY)
  if (!val) return Date.now()
  const parsed = parseInt(val, 10)
  return isNaN(parsed) ? Date.now() : parsed
}

function updateLastActiveTime() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString())
  }
}

function clearLastActiveTime() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(LAST_ACTIVE_KEY)
  }
}

/**
 * Hand the session issued by the API to supabase-js (token refresh, realtime).
 * The API has already verified the account, so the session is written straight
 * to supabase-js storage instead of calling setSession(), which makes another
 * network round trip to Supabase and fails on slow or unstable connections.
 */
async function storeSession(api: {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in: number
  expires_at: number
  user?: Record<string, unknown> | null
}): Promise<Session> {
  if (api.user && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          access_token: api.access_token,
          refresh_token: api.refresh_token,
          token_type: api.token_type ?? 'bearer',
          expires_in: api.expires_in,
          expires_at: api.expires_at,
          user: api.user,
        })
      )
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token === api.access_token) return data.session
    } catch {
      // Storage unavailable (e.g. blocked): fall back to setSession below.
    }
  }

  // Fallback (older API without `user`): let supabase-js verify the token.
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.auth.setSession({
      access_token: api.access_token,
      refresh_token: api.refresh_token,
    })
    if (!error && data.session) return data.session
    lastError = error
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  const reason = lastError instanceof Error ? ` (${lastError.message})` : ''
  throw new Error(`Signed in, but the session could not be stored in this browser${reason}. Check your connection and try again.`)
}

/** The recovery link lands on /admin/reset-password with a one-time session. */
const isRecoveryPage = () => typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/reset-password')

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [loading, setLoading] = useState(true)
  const profileLoaded = useRef(false)

  const clearState = useCallback(() => {
    clearLastActiveTime()
    profileLoaded.current = false
    setSession(null)
    setUser(null)
    setProfile(null)
    setPermissions(null)
    queryClient.clear()
  }, [queryClient])

  /** Load the profile + permissions from the API (enforces active employee). */
  const loadProfile = useCallback(async (): Promise<boolean> => {
    try {
      const me = await authApi.me()
      setProfile(me.profile)
      setPermissions(me.permissions)
      profileLoaded.current = true
      return true
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // Not an active employee (or session revoked): drop the local session.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        clearState()
      }
      return false
    }
  }, [clearState])

  /** Sign out: revoke the session on the server, then locally. */
  const signOut = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Already expired / offline: still clear the local session.
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    clearState()
    setLoading(false)
  }, [clearState])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let mounted = true

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return

        if (!data.session) {
          setLoading(false)
          return
        }
        if (!isRecoveryPage() && Date.now() - getLastActiveTime() >= INACTIVITY_TIMEOUT_MS) {
          await signOut()
          return
        }
        setSession(data.session)
        setUser(data.session.user)
        if (!isRecoveryPage()) await loadProfile()
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted || event === 'INITIAL_SESSION') return

      if (event === 'SIGNED_OUT' || !nextSession) {
        clearState()
        return
      }

      setSession(nextSession)
      setUser(nextSession.user)
      if (event === 'SIGNED_IN' && !profileLoaded.current && !isRecoveryPage()) {
        void loadProfile()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [clearState, loadProfile, signOut])

  /** 30-minute inactivity monitor */
  useEffect(() => {
    if (!profile) return

    let lastThrottle = 0
    const handleUserActivity = () => {
      const now = Date.now()
      if (now - lastThrottle > 1000) {
        lastThrottle = now
        updateLastActiveTime()
      }
    }

    const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart', 'pointerdown']
    activityEvents.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }))

    const checkInactivity = async () => {
      if (Date.now() - getLastActiveTime() >= INACTIVITY_TIMEOUT_MS) {
        await signOut()
      }
    }

    const intervalId = setInterval(() => void checkInactivity(), 5000)
    const handleVisibilityOrFocusChange = () => {
      if (document.visibilityState === 'visible') void checkInactivity()
    }
    window.addEventListener('visibilitychange', handleVisibilityOrFocusChange)
    window.addEventListener('focus', handleVisibilityOrFocusChange)

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleUserActivity))
      clearInterval(intervalId)
      window.removeEventListener('visibilitychange', handleVisibilityOrFocusChange)
      window.removeEventListener('focus', handleVisibilityOrFocusChange)
    }
  }, [profile, signOut])

  /**
   * Sign in through the API (which rejects inactive / non-employee accounts)
   * and hand the returned session to supabase-js for refresh and realtime.
   */
  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      try {
        const result = await authApi.login(email, password)
        updateLastActiveTime()
        profileLoaded.current = true
        setProfile(result.profile)
        setPermissions(result.permissions)
        const stored = await storeSession(result.session)
        setSession(stored)
        setUser(stored.user)
        queryClient.clear()
        return result.profile
      } catch (err) {
        clearState()
        throw err
      } finally {
        setLoading(false)
      }
    },
    [clearState, queryClient]
  )

  const refreshProfile = useCallback(async () => {
    await loadProfile()
  }, [loadProfile])

  const role = profile?.role ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      permissions,
      role,
      loading,
      isAuthenticated: Boolean(session && profile),
      isConfigured: isSupabaseConfigured,
      isAdmin: isAdminRole(role),
      signIn,
      signOut,
      refreshProfile,
      hasRole: (allowed) => hasRole(role, allowed),
      canAccess: (module) => canAccessModule(role, module),
      can: (module, action = 'view') => {
        // Prefer the server's answer; fall back to the mirrored matrix.
        const serverRule = permissions?.actions?.[module]
        return serverRule ? Boolean(serverRule[action]) : can(role, module, action)
      },
    }),
    [session, user, profile, permissions, role, loading, signIn, signOut, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

export function useRole() {
  const { role, profile, isAdmin, hasRole, canAccess, can, loading, isAuthenticated } = useAuth()
  return { role, profile, loading, isAuthenticated, isAdmin, hasRole, canAccess, can }
}
