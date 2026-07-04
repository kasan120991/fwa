import { Router } from 'express'
import { constructWebhookEvent } from '../services/stripe.js'
import { getContactByStripeCustomerId, updateContact } from '../repositories/contacts.repo.js'

export const webhooksRouter = Router()

// POST /api/webhooks/stripe — receives Stripe events. Authenticated by signature
// (not the session cookie), so it's mounted outside requireAuth. Needs the raw
// request body, which app.js parses as a Buffer for this path before JSON.
webhooksRouter.post('/stripe', async (req, res) => {
  let event
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature'])
  } catch (err) {
    return res.status(400).json({ error: { message: `Webhook signature verification failed: ${err.message}` } })
  }

  try {
    switch (event.type) {
      case 'customer.deleted': {
        // A customer removed in Stripe should no longer be referenced here; clear
        // the link so a future active-transition creates a fresh one.
        const customerId = event.data.object.id
        const contact = await getContactByStripeCustomerId(customerId)
        if (contact) {
          await updateContact(contact.id, { stripe_customer_id: null })
          console.log(`Stripe customer ${customerId} deleted — unlinked from contact ${contact.id}`)
        }
        break
      }
      default:
        // Acknowledge everything else; handlers get added as billing lands.
        break
    }
  } catch (err) {
    // 500 so Stripe retries a transient failure (e.g. DB blip).
    console.error(`Error handling Stripe webhook ${event.type}:`, err.message)
    return res.status(500).json({ error: { message: 'Webhook handler error' } })
  }

  res.json({ received: true })
})
