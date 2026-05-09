const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Single-product demo store. Edit constants when Wern goes live with real
// pricing / her own Stripe account.
const PRODUCT = {
  name: 'Ah Girl Homemade Sambal',
  description: '200g jar — authentic Malaysian chilli paste',
  unit_amount: 850,           // £8.50 in pence
  image_path: '/assets/jar.jpg',
};
const SHIPPING_COST_PENCE = 395;
const FREE_SHIPPING_THRESHOLD_PENCE = 2500;
const MAX_QTY = 12;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const qty = Math.min(MAX_QTY, Math.max(1, parseInt(body.quantity, 10) || 1));

  const host = event.headers.host || '';
  const origin = event.headers.origin || (host ? `https://${host}` : '');

  const subtotal = PRODUCT.unit_amount * qty;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_PENCE
    ? { display_name: 'Free UK shipping', fixed_amount: { amount: 0, currency: 'gbp' } }
    : { display_name: 'UK tracked shipping', fixed_amount: { amount: SHIPPING_COST_PENCE, currency: 'gbp' } };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: PRODUCT.name,
            description: PRODUCT.description,
            images: origin ? [`${origin}${PRODUCT.image_path}`] : undefined,
          },
          unit_amount: PRODUCT.unit_amount,
        },
        quantity: qty,
      }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled#buy`,
      allow_promotion_codes: true,
      shipping_address_collection: { allowed_countries: ['GB'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          ...shipping,
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 5 },
          },
        },
      }],
      phone_number_collection: { enabled: true },
      metadata: {
        client: 'ah-girl',
        type: 'ah_girl_order',
        product: 'sambal-200g',
        qty: String(qty),
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, id: session.id }),
    };
  } catch (err) {
    console.error('ah-girl Stripe session creation failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not start checkout. Please try again.' }),
    };
  }
};
