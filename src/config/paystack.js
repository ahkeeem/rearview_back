// Paystack configuration — uses test keys in dev, live in production
// Sign up at https://paystack.com to get your keys

module.exports = {
  SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || 'sk_test_xxxxxxxxxxxxx',
  PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_xxxxxxxxxxxxx',
  BASE_URL: 'https://api.paystack.co',
  COMMISSION_RATE: parseFloat(process.env.COMMISSION_RATE || '0.025'), // 2.5%
  CURRENCY: 'NGN',

  // Helper: make Paystack API call
  async request(method, path, data = null) {
    const fetch = (await import('node-fetch')).default;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    if (data) options.body = JSON.stringify(data);

    const response = await fetch(`${this.BASE_URL}${path}`, options);
    return response.json();
  },

  // Mock mode: when no real keys are set
  isMockMode() {
    return this.SECRET_KEY === 'sk_test_xxxxxxxxxxxxx';
  }
};
