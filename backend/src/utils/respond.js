/**
 * Response helpers so every endpoint answers with the same envelope:
 *   single:  { data }
 *   list:    { data: [...], meta: { total, page, limit } }  + X-Total-Count
 */
export function sendData(res, data, status = 200) {
  res.status(status).json({ data })
}

export function sendList(res, { rows, count, page, limit }) {
  res.set('X-Total-Count', String(count))
  res.json({ data: rows, meta: { total: count, page, limit } })
}

export function sendNoContent(res) {
  res.status(204).end()
}
