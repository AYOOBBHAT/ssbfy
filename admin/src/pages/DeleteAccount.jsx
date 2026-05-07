export default function DeleteAccount() {
  return (
    <div className="legal-page-wrap">
      <article className="legal-page">
        <h1 className="page-title">Request Account Deletion</h1>
        <p className="page-subtitle">
          You can request deletion of your SSBFY account and associated data.
        </p>

        <section>
          <h2>What may be deleted</h2>
          <ul>
            <li>Profile/account data</li>
            <li>Saved materials</li>
            <li>App activity/history</li>
          </ul>
        </section>

        <section>
          <h2>Important note</h2>
          <p>
            Some payment, billing, or legal records may be retained if required by law or for
            legitimate compliance purposes.
          </p>
        </section>

        <section>
          <h2>How to request deletion</h2>
          <p>
            Email us from your registered account email address with the subject:{' '}
            <strong>Delete My Account</strong>
          </p>
          <p>
            Email:{' '}
            <a href="mailto:support.ssbfy@gmail.com?subject=Delete%20My%20Account">
              support.ssbfy@gmail.com
            </a>
          </p>
        </section>
      </article>
    </div>
  );
}

