import { config } from '../config/env.js'
import {
  listUpcomingRenewals, markRenewalReminded, listLapsedRenewals, advanceRenewal
} from '../repositories/expenses.repo.js'
import { notify } from './notifications.service.js'

// Format a 'YYYY-MM-DD' string (dateStrings from the pool) as "Mar 12, 2026".
function fmtDate(ymd) {
  if (!ymd) return ''
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[(m || 1) - 1]} ${d}, ${y}`
}

/**
 * Post a reminder for each active subscription renewing within the configured
 * window that hasn't been reminded for the current cycle, then roll any lapsed
 * subscriptions forward to their next cycle. Broadcast notifications (no actor)
 * so they always toast. Idempotent: `renewal_reminded_on` gates re-sends.
 */
export async function checkSubscriptionRenewals() {
  // Advance subscriptions whose renewal date already passed so their next cycle
  // (and the next reminder) is set up before we scan the upcoming window.
  for (const id of await listLapsedRenewals()) {
    await advanceRenewal(id).catch(e => console.error(`[reminders] advance ${id}:`, e.message))
  }

  const due = await listUpcomingRenewals(config.expenses.reminderDays)
  for (const sub of due) {
    try {
      await notify({
        category: 'expense', tone: 'warning', icon: 'i-lucide-calendar-clock',
        title: 'Subscription renewing soon',
        body: `${sub.vendor} renews ${fmtDate(sub.next_renewal_at)} — $${Number(sub.amount).toLocaleString('en-US')}`,
        link: '/expenses'
      })
      await markRenewalReminded(sub.id, sub.next_renewal_at)
    } catch (err) {
      console.error(`[reminders] renewal ${sub.id}:`, err.message)
    }
  }
  return due.length
}
