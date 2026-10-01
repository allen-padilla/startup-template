import { getSession } from "@startup/auth/next";
import {
  AlreadySubscribedError,
  BillingConfigurationError,
  createSubscriptionCheckout,
} from "@startup/billing";

// Starts a Stripe Checkout Session for the configured Pro monthly price.
// The request body is ignored: the price is controlled by the server.
export async function POST() {
  const session = await getSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const checkout = await createSubscriptionCheckout(session.user);

    return Response.json({ url: checkout.url });
  } catch (error) {
    if (error instanceof AlreadySubscribedError) {
      return Response.json(
        { error: "already_subscribed", message: error.message },
        { status: 409 },
      );
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
}
