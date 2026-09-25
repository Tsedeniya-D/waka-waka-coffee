import * as authService from '../services/auth.service.js'
import { updateOwnProfile } from '../services/profile.service.js'
import { describeTransitions } from '../services/workflow.service.js'

export async function login(req, res) {
  const result = await authService.login(req.valid.body)
  res.json({ data: result })
}

export async function refresh(req, res) {
  const result = await authService.refresh(req.valid.body)
  res.json({ data: result })
}

export async function logout(req, res) {
  await authService.revokeSession(req.auth.token)
  res.status(204).end()
}

export async function requestPasswordReset(req, res) {
  await authService.requestPasswordReset(req.valid.body)
  res.status(202).json({
    data: { message: 'If an account exists for that email, a reset link has been sent.' },
  })
}

export async function me(req, res) {
  const { userId, email, profile, role } = req.auth
  res.json({
    data: {
      user: { id: userId, email },
      profile,
      permissions: authService.permissionsFor(role),
    },
  })
}

export async function updateMe(req, res) {
  const profile = await updateOwnProfile(req.auth.db, req.auth.userId, req.valid.body)
  res.json({ data: profile })
}

export async function changePassword(req, res) {
  await authService.changePassword(
    { email: req.auth.email, accessToken: req.auth.token },
    req.valid.body
  )
  res.json({ data: { message: 'Password updated.' } })
}

export async function completePasswordReset(req, res) {
  await authService.completePasswordReset({ accessToken: req.auth.token }, req.valid.body)
  res.json({ data: { message: 'Password updated. You can now sign in with the new password.' } })
}

/** Workflow status rules for the caller's role (drives status menus in the UI). */
export async function workflows(req, res) {
  res.json({ data: await describeTransitions(req.auth.db, req.auth.role) })
}
