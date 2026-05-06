export default function PrivacyPolicy() {
  return (
    <div className="legal-page-wrap">
      <article className="legal-page">
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-subtitle">Last updated: May 5, 2026</p>

        <section>
          <h2>1. Information We Collect</h2>
          <p>We collect only the information needed to run SSBFY:</p>
          <ul>
            <li>Name and email address (for account login and support)</li>
            <li>Usage data (such as tests attempted and feature usage)</li>
          </ul>
        </section>

        <section>
          <h2>2. How We Use Your Information</h2>
          <p>We use your data to:</p>
          <ul>
            <li>Authenticate your account and keep your profile secure</li>
            <li>Deliver app features like mock tests, saved materials, and premium access</li>
            <li>Improve app performance and overall learning experience</li>
            <li>Analyze basic usage patterns to make better product decisions</li>
          </ul>
        </section>

        <section>
          <h2>3. Payments</h2>
          <p>
            Subscription payments are processed by Razorpay. SSBFY does not store your full card number,
            CVV, UPI PIN, or banking credentials on our servers.
          </p>
        </section>

        <section>
          <h2>4. Data Security</h2>
          <p>
            We use reasonable technical and operational safeguards to protect user data. While no
            online system can guarantee absolute security, we continuously work to improve protection.
          </p>
        </section>

        <section>
          <h2>5. Third-Party Services</h2>
          <p>
            We currently use Razorpay for payment processing. Their policies apply to payment data
            handled on their platform.
          </p>
        </section>

        <section>
          <h2>6. Your Rights</h2>
          <p>
            You may request account or data deletion, or ask privacy-related questions, by contacting
            us at <a href="mailto:support@ssbfy.com">support@ssbfy.com</a>.
          </p>
        </section>

        <section>
          <h2>7. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Updated versions will be posted on
            this page with a revised "Last updated" date.
          </p>
        </section>
      </article>
    </div>
  );
}
