import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { errorMessage } from '../../lib/api'
import { authApi } from '../../api'
import { getRoleDefaultDashboard } from '../../lib/permissions'
import { loginSchema } from '../../lib/schemas'
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  Ship,
  ShieldCheck,
  Sprout,
} from 'lucide-react'
import LogoImg from '../../../images/logo.png'

const AdminLogin = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()
  const { signIn, isAuthenticated, role, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const targetPath = getRoleDefaultDashboard(role)
      navigate(targetPath, { replace: true })
    }
  }, [authLoading, isAuthenticated, role, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Invalid credentials format.')
      return
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    setLoading(true)
    try {
      // The API only issues a session to ACTIVE employee accounts.
      const profile = await signIn(parsed.data.email, parsed.data.password)
      navigate(getRoleDefaultDashboard(profile.role), { replace: true })
    } catch (err: unknown) {
      setError(errorMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!email.trim()) {
      setError('Enter your work email address.')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.requestReset(email.trim(), `${window.location.origin}/admin/reset-password`)
      setNotice(res.message)
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not send the reset email.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-cream-50 font-sans">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex lg:w-[46%] xl:w-1/2 flex-col justify-between overflow-hidden bg-[#2b1a0f] text-white p-12">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-coffee-600/30 blur-3xl" />
        </div>

        <Link to="/" className="relative z-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <img src={LogoImg} alt="Waka Coffee" className="h-10 w-10 object-contain" />
          </div>
          <div>
            <p className="font-serif text-2xl font-bold leading-tight">Waka Coffee</p>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-coffee-300">Export</p>
          </div>
        </Link>

        <div className="relative z-10 max-w-md">
          <span className="mb-6 block h-0.5 w-12 rounded-full bg-primary-500" />
          <h2 className="font-serif text-4xl xl:text-5xl font-semibold leading-tight">
            From Ethiopian highlands to the world.
          </h2>
          <p className="mt-5 font-sans text-base leading-relaxed text-coffee-200">
            Manage sourcing, quality, inventory and export shipments from one secure workspace.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              { Icon: Sprout, text: 'Traceable sourcing from farm to lot' },
              { Icon: ShieldCheck, text: 'Quality control and grading records' },
              { Icon: Ship, text: 'Export batches, documents and shipments' },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 font-sans text-sm text-coffee-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-primary-400" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 font-sans text-xs text-coffee-300/80">
          © {new Date().getFullYear()} Waka Coffee Export. Internal system.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2b1a0f]">
              <img src={LogoImg} alt="Waka Coffee" className="h-8 w-8 object-contain" />
            </div>
            <div>
              <p className="font-serif text-xl font-bold leading-tight text-[#2b1a0f]">Waka Coffee</p>
              <p className="font-sans text-[11px] uppercase tracking-[0.3em] text-coffee-600">Export</p>
            </div>
          </Link>

          <div className="rounded-2xl border border-coffee-100 bg-white p-8 shadow-xl shadow-coffee-900/5 sm:p-10">
            <div className="mb-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-coffee-50 px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-coffee-700 ring-1 ring-coffee-100">
                <Lock className="h-3 w-3" />
                Staff portal
              </span>
              <h1 className="mt-4 font-serif text-3xl font-semibold text-[#2b1a0f]">Welcome back</h1>
              <p className="mt-2 font-sans text-sm leading-relaxed text-stone-500">
                Sign in to the Waka Coffee admin. Staff access only. Contact an administrator if
                you need an account.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="font-sans text-sm">{error}</p>
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm text-green-800"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="font-sans text-sm">{notice}</p>
              </div>
            )}

            <form onSubmit={resetMode ? handleResetRequest : handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="admin-email"
                  className="mb-1.5 block font-sans text-sm font-semibold text-coffee-900"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-coffee-400" />
                  <input
                    id="admin-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="you@wakacoffee.com"
                    className="w-full rounded-xl border border-coffee-200 bg-cream-50/60 py-3 pl-10 pr-4 font-sans text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-primary-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-600/15"
                  />
                </div>
              </div>

              {!resetMode && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="admin-password"
                    className="block font-sans text-sm font-semibold text-coffee-900"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(true)
                      setError(null)
                      setNotice(null)
                    }}
                    className="font-sans text-xs font-medium text-primary-700 hover:text-primary-800"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-coffee-400" />
                  <input
                    id="admin-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-coffee-200 bg-cream-50/60 py-3 pl-10 pr-11 font-sans text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-primary-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-600/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-coffee-400 transition-colors hover:bg-coffee-50 hover:text-coffee-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              )}

              <button
                type="submit"
                disabled={loading || authLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 font-sans text-sm font-semibold text-white shadow-lg shadow-primary-600/25 transition-all hover:bg-primary-700 hover:shadow-primary-700/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-600/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {resetMode ? 'Sending…' : 'Signing in…'}
                  </>
                ) : (
                  <>
                    {resetMode ? 'Send reset link' : 'Sign in'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {resetMode && (
                <button
                  type="button"
                  onClick={() => {
                    setResetMode(false)
                    setError(null)
                    setNotice(null)
                  }}
                  className="w-full text-center font-sans text-sm text-coffee-700 hover:text-[#2b1a0f]"
                >
                  Back to sign in
                </button>
              )}
            </form>
          </div>

          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-1.5 font-sans text-sm text-coffee-700 transition-colors hover:text-[#2b1a0f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to public site
          </Link>
        </div>
      </main>
    </div>
  )
}

export default AdminLogin
