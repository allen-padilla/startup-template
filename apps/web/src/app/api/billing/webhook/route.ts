import {
  BillingConfigurationError,
  constructBillingWebhookEvent,
  handleBillingWebhookEvent,
  WebhookSignatureError,
} from "@startup/billing";

// Stripe webhook endpoint. The raw body must be read as text: signature
// verification is over the exact bytes Stripe sent, so it must not be parsed
// as JSON first.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();

  let event;

  try {
    event = constructBillingWebhookEvent(payload, signature);
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof BillingConfigurationError) {
      console.error(error.message);

      return Response.json(
        { error: "Billing is not configured" },
        { status: 503 },
      );
    }

    throw error;
  }

  // Processing errors propagate as a 500 so Stripe retries the delivery.
  const result = await handleBillingWebhookEvent(event);

  if (result.outcome === "unknown_customer") {
    // Acknowledged so Stripe stops retrying: the customer does not belong to
    // this application, and retrying cannot change that.
    console.warn("Ignored Stripe webhook for unknown customer", {
      eventId: event.id,
      eventType: event.type,
      stripeCustomerId: result.stripeCustomerId,
    });
  }

  return Response.json({ received: true });
}
