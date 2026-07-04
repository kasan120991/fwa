import { getService } from '../repositories/services.repo.js'

// Turn a request's line-item input into frozen snapshot rows and compute the
// total. A line is either a catalog line (service_id set — snapshot off the
// service, overridable) or a one-off custom line (no service_id — name +
// unit_price required). Shared by proposal and contract creation so both
// snapshot identically. Throws a 400 (with field errors) on invalid input.
export async function resolveLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Validation failed')
    err.status = 400
    err.fields = { items: 'must be a non-empty array of line items' }
    throw err
  }

  const fields = {}
  const rows = []

  for (const [i, raw] of items.entries()) {
    const li = raw ?? {}
    let service = null

    if (li.service_id != null) {
      const sid = Number(li.service_id)
      if (!Number.isInteger(sid) || sid <= 0) { fields[`items[${i}].service_id`] = 'must be a valid service id'; continue }
      service = await getService(sid)
      if (!service) { fields[`items[${i}].service_id`] = `service ${sid} not found`; continue }
    }

    const name = (li.name ?? service?.name ?? '').toString().trim()
    if (!name) { fields[`items[${i}].name`] = 'a name is required for a custom line'; continue }

    const unit = li.unit_price != null ? Number(li.unit_price) : service?.price
    if (unit == null || !Number.isFinite(Number(unit)) || Number(unit) < 0) { fields[`items[${i}].unit_price`] = 'must be a number >= 0'; continue }

    const qty = li.qty != null ? Number(li.qty) : 1
    if (!Number.isFinite(qty) || qty <= 0) { fields[`items[${i}].qty`] = 'must be a number > 0'; continue }

    const billing = li.billing_interval ?? service?.billing_interval ?? 'one_time'
    if (billing !== 'one_time' && billing !== 'monthly') { fields[`items[${i}].billing_interval`] = 'must be one_time or monthly'; continue }

    rows.push({
      service_id: service ? service.id : null,
      name_snapshot: name,
      description_snapshot: li.description ?? service?.description ?? null,
      unit_price_snapshot: Number(unit),
      qty,
      billing_interval_snapshot: billing,
      sort_order: i
    })
  }

  if (Object.keys(fields).length) {
    const err = new Error('Validation failed')
    err.status = 400
    err.fields = fields
    throw err
  }

  const total = rows.reduce((sum, r) => sum + r.unit_price_snapshot * r.qty, 0)
  return { rows, total: Math.round(total * 100) / 100 }
}
