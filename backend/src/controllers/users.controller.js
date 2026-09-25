import * as svc from '../services/users.service.js'
import { sendData, sendList } from '../utils/respond.js'

export async function list(req, res) {
  sendList(res, await svc.list(req.auth.db, req.valid.query))
}

export async function directory(req, res) {
  sendData(res, await svc.directory(req.auth.db, req.valid.query))
}

export async function get(req, res) {
  sendData(res, await svc.get(req.auth.db, req.valid.params.id))
}

export async function create(req, res) {
  sendData(res, await svc.create(req.auth.db, req.auth, req.valid.body), 201)
}

export async function update(req, res) {
  sendData(res, await svc.update(req.auth.db, req.valid.params.id, req.valid.body))
}

export async function changeRole(req, res) {
  sendData(res, await svc.changeRole(req.auth.db, req.auth, req.valid.params.id, req.valid.body.role))
}

export async function setStatus(req, res) {
  sendData(res, await svc.setActive(req.auth.db, req.auth, req.valid.params.id, req.valid.body.is_active))
}

export async function passwordReset(req, res) {
  sendData(res, await svc.sendPasswordReset(req.auth.db, req.valid.params.id), 202)
}
