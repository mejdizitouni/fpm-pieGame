import React from "react";

function SalesforceLogin() {
  return (
    <div>
      <form
        id="loginForm"
        method="POST"
        action="https://mhengage--uat.sandbox.my.salesforce.com/secur/frontdoor.jsp"
      >
        <input
          type="hidden"
          name="sid"
          value="!AQsAQDuYl8QLrKehAAeDB41xq1M4ZGYcUmmaVT.k2C5y4rQWfNbpDMdUZ5mK0L1xmKV8YCn_ds0IoOZNRUcgTv5.i4BD8_RW"
        />
        <input
          type="hidden"
          name="retURL"
          value="/servlet/networks/session/create?site=0DM7U000000oLnTWAU&url=/s"
        />
        <button type="submit">Login to Salesforce</button>
      </form>
    </div>
  );
}

export default SalesforceLogin;
