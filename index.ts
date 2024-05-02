import { strict as assert } from "node:assert";

assert.ok(Bun.env.XERO_CLIENT_ID != null, `XERO_CLIENT_ID is missing`);
assert.ok(Bun.env.XERO_CLIENT_SECRET != null, `XERO_CLIENT_SECRET is missing`);
assert.ok(Bun.env.PUSHOVER_TOKEN != null, `PUSHOVER_TOKEN is missing`);
assert.ok(Bun.env.PUSHOVER_USER != null, `PUSHOVER_USER is missing`);

assert.ok(Bun.env.XERO_CLIENT_ID != "", `XERO_CLIENT_ID is empty`);
assert.ok(Bun.env.XERO_CLIENT_SECRET != "", `XERO_CLIENT_SECRET is empty`);
assert.ok(Bun.env.PUSHOVER_TOKEN != "", `PUSHOVER_TOKEN is empty`);
assert.ok(Bun.env.PUSHOVER_USER != "", `PUSHOVER_USER is empty`);

const xeroClientId = Bun.env.XERO_CLIENT_ID;
const xeroClientSecret = Bun.env.XERO_CLIENT_SECRET;
const pushoverToken = Bun.env.PUSHOVER_TOKEN;
const pushoverUser = Bun.env.PUSHOVER_USER;

// 1. Connect to Xero
import { type AccountingApi, XeroClient } from "xero-node";

import { Decimal } from "decimal.js";
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

const xero = new XeroClient({
  clientId: xeroClientId,
  clientSecret: xeroClientSecret,
  grantType: "client_credentials",
});

await xero.getClientCredentialsToken();

// 2. Fetch data from Xero
type ProfitAndLossReport = {
  Income: { title: string; amount: Decimal }[];
};

async function getProfitAndLoss(
  xeroRef: XeroClient,
  fromDate: string,
  toDate: string
): Promise<ProfitAndLossReport> {
  let res: Awaited<ReturnType<AccountingApi["getReportTrialBalance"]>>;
  try {
    res = await xero.accountingApi.getReportProfitAndLoss("", fromDate, toDate);
  } catch (e) {
    if ((e as any)?.response?.statusCode === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      return getProfitAndLoss(xeroRef, fromDate, toDate);
    }

    throw e;
  }

  if (res?.body?.reports?.[0]?.rows == null) {
    throw new Error("Empty response from Xero");
  }

  const rows = res.body.reports[0].rows.find((x) => x.title === "Income")?.rows;

  if (rows == null || rows.length == 0) {
    throw new Error("No income rows found in Xero P&L report");
  }

  const output: ProfitAndLossReport = { Income: [] };

  for (const row of rows) {
    output["Income"].push({
      title: row?.cells?.[0].value as string,
      amount: new Decimal(row?.cells?.[1]?.value as string),
    });
  }

  return output;
}

import { addDays, subDays, subYears, endOfDay, format } from "date-fns";

const endDate = subDays(endOfDay(new Date()), 1);
const startDate = addDays(subYears(endDate, 1), 1);

const endDateStr = format(endDate, "yyyy-MM-dd");
const startDateStr = format(startDate, "yyyy-MM-dd");

const data = await getProfitAndLoss(xero, startDateStr, endDateStr);
const totalStr = data?.Income.find((x) => x.title === "Total Income")?.amount;

if (totalStr == null) {
  throw new Error("'Total Income' line not found in Xero P&L report");
}

const total = new Decimal(totalStr);
const percentage = total.div(1500000).mul(100).floor().toFixed(0);

function formatMoney(input: Decimal): string {
  return `$${input
    .div(1000)
    .floor()
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}k`;
}

const message = `${percentage}% · ${formatMoney(total)} of $1,500k goal`;

// 3. Send push notification
import axios from "axios";

async function sendPushoverNotification(params: {
  title: string;
  message: string;
}) {
  await axios.post("https://api.pushover.net/1/messages.json", {
    token: pushoverToken,
    user: pushoverUser,
    ...params,
  });
}

await sendPushoverNotification({ title: `${percentage}% to EO Goal`, message });

console.log("Sent notification");
