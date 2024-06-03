import {strict as assert} from 'node:assert';

function validateEnv(name: string, required = false): string | false {
  let value = Bun.env[name];

  if (value == null) {
    if (required) {
      throw new Error(`${name} is missing`);
    }
    return false;
  }

  value = value.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  if (value === '') {
    if (required) {
      throw new Error(`${name} is empty`);
    }
    return false;
  }

  return value;
}

const xeroClientId = validateEnv('XERO_CLIENT_ID', true) as string;
const xeroClientSecret = validateEnv('XERO_CLIENT_SECRET', true) as string;
const pushoverToken = validateEnv('PUSHOVER_TOKEN');
const pushoverUser = validateEnv('PUSHOVER_USER');
const participantName = validateEnv('EO_NAME');
const participantChapter = validateEnv('EO_CHAPTER');

const hasPushover = pushoverToken !== false && pushoverUser !== false;
const hasEO = participantName !== false && participantChapter !== false;

if (!hasPushover && !hasEO) {
  throw new Error('Configure at least one of the Pushover notification or the EO report');
}

import {Decimal} from 'decimal.js';
Decimal.set({rounding: Decimal.ROUND_HALF_UP});

import axios from 'axios';

// 1. Connect to Xero
import {type AccountingApi, XeroClient, RowType} from 'xero-node';

const xero = new XeroClient({
  clientId: xeroClientId,
  clientSecret: xeroClientSecret,
  grantType: 'client_credentials',
});

await xero.getClientCredentialsToken();

// 2. Fetch rolling twelve revenue from Xero
import {addDays, subDays, subYears, endOfDay, format} from 'date-fns';

async function getRollingTwelveRevenue(xeroRef: XeroClient): Promise<{start: string; end: string; amount: Decimal}> {
  const endDate = subDays(endOfDay(new Date()), 1);
  const startDate = addDays(subYears(endDate, 1), 1);

  const endDateStr = format(endDate, 'yyyy-MM-dd');
  const startDateStr = format(startDate, 'yyyy-MM-dd');

  let res: Awaited<ReturnType<AccountingApi['getReportProfitAndLoss']>>;
  try {
    res = await xero.accountingApi.getReportProfitAndLoss('', startDateStr, endDateStr);
  } catch (e) {
    if (typeof e === 'string' && JSON.parse(e as any)?.response?.statusCode === 429) {
      await new Promise(r => setTimeout(r, 2000));
      return getRollingTwelveRevenue(xeroRef);
    }

    throw e;
  }

  if (res?.body?.reports?.[0]?.rows == null) {
    throw new Error('Empty response from Xero');
  }

  const rows = res.body.reports[0].rows.find(x => x.title === 'Income')?.rows;

  if (rows == null || rows.length == 0) {
    throw new Error('No income rows found in Xero P&L report');
  }

  const totalIncome = rows.find(x => x.rowType === RowType.SummaryRow);
  if (totalIncome == null || totalIncome?.cells?.[0]?.value !== 'Total Income' || totalIncome.cells?.length !== 2) {
    throw new Error("'Total Income' line not found in Xero P&L report");
  }

  return {start: startDateStr, end: endDateStr, amount: new Decimal(totalIncome?.cells[1].value as string)};
}

const {start: rollingTwelveStart, end: rollingTwelveEnd, amount: rollingTwelve} = await getRollingTwelveRevenue(xero);

// 3. Send push notification
if (hasPushover) {
  const percentage = rollingTwelve.div(1500000).mul(100).floor().toFixed(0);

  function formatMoney(input: Decimal): string {
    return `$${input
      .div(1000)
      .floor()
      .toFixed(0)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}k`;
  }

  const message = `${percentage}% · ${formatMoney(rollingTwelve)} of $1,500k goal`;

  async function sendPushoverNotification(params: {title: string; message: string}) {
    await axios.post('https://api.pushover.net/1/messages.json', {
      token: pushoverToken,
      user: pushoverUser,
      ...params,
    });
  }

  await sendPushoverNotification({title: `${percentage}% to EO Goal`, message});

  console.log('Sent notification to pushover');
}

// 4. Optional: fetch twelve months revenue from Xero and report to EO backend
import {subMonths, startOfMonth, endOfMonth} from 'date-fns';
import packageData from './package.json';

if (hasEO) {
  async function getTwelveMonthsRevenue(
    xeroRef: XeroClient
  ): Promise<{companyName: string; data: {month: string; amount: Decimal}[]}> {
    const lastMonth = subMonths(new Date(), 1);

    const startOfLastMonth = format(startOfMonth(lastMonth), 'yyyy-MM-dd');
    const endOfLastMonth = format(endOfMonth(lastMonth), 'yyyy-MM-dd');

    let res: Awaited<ReturnType<AccountingApi['getReportTrialBalance']>>;
    try {
      res = await xero.accountingApi.getReportProfitAndLoss('', startOfLastMonth, endOfLastMonth, 11, 'MONTH');
    } catch (e) {
      if (typeof e === 'string' && JSON.parse(e as any)?.response?.statusCode === 429) {
        await new Promise(r => setTimeout(r, 2000));
        return getTwelveMonthsRevenue(xeroRef);
      }

      throw e;
    }

    if (res?.body?.reports?.[0]?.rows == null) {
      throw new Error('Empty response from Xero');
    }

    const companyName = res.body.reports?.[0]?.reportTitles?.[1] as string;

    // Sanity check that we have the 12 months of data we expect
    const headerRow = res.body.reports[0].rows?.[0];
    const summaryRow = res.body.reports[0].rows
      ?.find(x => x.title === 'Income')
      ?.rows?.find(x => x.rowType === RowType.SummaryRow);

    assert.ok(headerRow.rowType === RowType.Header);
    assert.ok(summaryRow != null);
    assert.ok(headerRow.cells?.length === 13);
    assert.ok(summaryRow.cells?.length === 13);

    const data = [];

    for (let i = 0; i < 12; i++) {
      const endOfMonthObj = endOfMonth(subMonths(new Date(), i + 1));

      assert.ok(headerRow.cells?.[i + 1].value === format(endOfMonthObj, 'dd MMM yy'));

      data.push({
        month: format(endOfMonthObj, 'yyyy-MM'),
        amount: new Decimal(summaryRow.cells?.[i + 1].value as string),
      });
    }

    return {companyName, data};
  }

  const {companyName, data: twelveMonths} = await getTwelveMonthsRevenue(xero);

  const postObj = {
    version: packageData.version,
    participantName,
    participantChapter,
    companyName,
    twelveMonths,
    rollingTwelve: {start: rollingTwelveStart, end: rollingTwelveEnd, amount: rollingTwelve.toFixed(2)},
  };

  const endpoints = await axios.get('https://eogoal.github.io/Endpoints/endpoints.json');

  if (endpoints.status !== 200) {
    throw new Error('Failed to fetch endpoints');
  }

  (async () => {
    if (endpoints.data?.[participantChapter] == null) {
      // Gracefully fail without error
      console.log('No endpoint found for participant chapter');
      return;
    }

    const endpoint = new URL(endpoints.data[participantChapter]);
    if (endpoint.protocol !== 'https:') {
      throw new Error('Endpoint must be HTTPS');
    }

    let report;
    try {
      report = await axios.post(endpoint.toString(), postObj);
    } catch (e) {
      console.error(e);
      return;
    }

    if (report.status !== 200) {
      console.log('Failed to send report');
      return;
    }

    console.log('Sent report to EO backend');
  })();
}
