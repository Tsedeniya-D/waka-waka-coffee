import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleAlert, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { errorMessage } from '../../lib/api'
import { authApi } from '../../api'
import LogoImg from '../../../images/logo.png'

/**
 * Landing page of the password-reset email. Supabase puts a one-time recovery
 * session in the URL; the new password is then set through the API.
 */
export default function AdminResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    // detectSessionInUrl processes the link; give it a moment, then check.
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (active) setReady(Boolean(data.session))
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    const t = setTimeout(check, 400)
    return () => {
      active = false
      clearTimeout(t)
      sub.subscription.unsubscribe()
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Use at least 8 characters with at least one letter and one number.')
      return
    }
    if (password !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setSaving(true)
    try {
      await authApi.completeReset(password)
      await supabase.auth.signOut({ scope: 'local' })
      setDone(true)
      setTimeout(() => navigate('/admin/login', { replace: true }), 2500)
    } catch (err) {
      setError(errorMessage(err, 'Could not update the password.'))
    } finally {
      setSaving(false)
    }
  }

  const input =
    'w-full rounded-xl border border-coffee-200 bg-cream-50/60 px-4 py-3 font-sans text-sm text-stone-900 placeholder:text-stone-400 focus:border-primary-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-600/15'

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50 px-6 py-12 font-sans">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2b1a0f]">
            <img src={LogoImg} alt="Waka Coffee" className="h-8 w-8 object-contain" />
          </div>
          <p className="font-serif text-xl font-bold text-[#2b1a0f]">Waka Coffee</p>
        </Link>

        <div className="rounded-2xl border border-coffee-100 bg-white p-8 shadow-xl shadow-coffee-900/5">
          <span className="inline-flex items-center gap-2 rounded-full bg-coffee-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-coffee-700 ring-1 ring-coffee-100">
            <KeyRound className="h-3 w-3" />
            Reset password
          </span>
          <h1 className="mt-4 font-serif text-2xl font-semibold text-[#2b1a0f]">Choose a new password</h1>

          {ready === false && (
            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This reset link is invalid or has expired. Request a new one from the sign-in page.</p>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {done ? (
            <div role="status" className="mt-6 flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Your password was updated. Redirecting to sign in…</p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-coffee-900">
                  New password
                </label>
                <input id="new-password" type="password" autoComplete="new-password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready} />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold text-coffee-900">
                  Confirm new password
                </label>
                <input id="confirm-password" type="password" autoComplete="new-password" className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!ready} />
              </div>
              <button
                type="submit"
                disabled={!ready || saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Update password
              </button>
            </form>
          )}
        </div>

        <Link to="/admin/login" className="mt-8 inline-flex items-center gap-1.5 text-sm text-coffee-700 hover:text-[#2b1a0f]">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
