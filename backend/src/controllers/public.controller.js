import * as svc from '../services/public.service.js'
import { sendData } from '../utils/respond.js'

export async function createQuoteRequest(req, res) {
  sendData(res, await svc.submitQuoteRequest(req.valid.body), 201)
}

export async function createSampleRequest(req, res) {
  sendData(res, await svc.submitSampleRequest(req.valid.body), 201)
}

export async function createContactMessage(req, res) {
  sendData(res, await svc.submitContactMessage(req.valid.body), 201)
}

export async function subscribeNewsletter(req, res) {
  sendData(res, await svc.subscribeNewsletter(req.valid.body), 201)
}

export async function listProducts(req, res) {
  sendData(res, await svc.listProducts({ featured: req.query.featured === 'true' }))
}

export async function getProduct(req, res) {
  sendData(res, await svc.getProduct(req.valid.params.slug))
}

export async function downloadDocument(req, res) {
  sendData(res, await svc.publicDocumentUrl(req.valid.params.id))
}
