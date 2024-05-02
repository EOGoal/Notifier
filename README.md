# EO Goal Daily Notification

This template will allow you to easily set up a daily notification of your rolling twelve months of revenue straight from Xero.

It will run each morning at 8am Brisbane Time, and it will calculate your total revenue over the twelve months ending from the previous midnight, and starting one calendar year before that.

The data comes directly from the "Total Income" line Profit and Loss report in Xero.

### How It Looks

[Add Screenshot Here]

### Requirements

| Service                | Cost                      |
| ---------------------- | ------------------------- |
| Xero Custom Connection | AUD $10 inc GST per month |
| Pushover App           | USD $5 once-off           |
| GitHub                 | Free                      |

### Setup

#### GitHub Account

GitHub is a code management service by Microsoft. We're using it to duplicate the template for this notification code and to run it on a daily schedule.

1. Create a free GitHub account
2. Click on [Use this template](https://github.com/new?template_name=RevenueNotification&template_owner=winterec) to duplicate this template into your own private copy.

   - Make sure to select the private option, make the repository name anything you like

3. Click _Settings_ -> _Secrets and variables_ -> _Actions_, then click _New Repository Secret_

Leave this page open. Through the rest of the guide we'll add the four configuration tokens needed to connect to Xero and send a push notification.

![Adding GitHub Actions Secrets](https://i.imgur.com/5rM3rWa.png?raw=true)

#### Xero Connection

1. Go to https://connect.xero.com/custom to purchase a Xero Custom Connection
2. Follow steps 1-4 of https://developer.xero.com/documentation/guides/oauth2/custom-connections/

- For step 2, only check the `accounting.report.read` permission as it's the only one required.

3. Back in GitHub, save the Client ID as `XERO_CLIENT_ID`, and the Client Secret as `XERO_CLIENT_SECRET`.

#### Pushover App

1. Sign up to https://pushover.net/ and install the app on your mobile or desktop.
   - There is a 30 day trial and then it's a one off $5 USD for a lifetime account.
2. At the top right of the page you will find _Your User Key_, save that in GitHub as `PUSHOVER_USER`.
3. Click in to _Create an Application/API Token_
   - For the name, use "EO Progress" or similar.
   - For the icon, feel free to use this EO Logo: https://pushover.net/icons/5rfvoyps4pxhopu.png
4. Click into the EO Progress app you just created and copy the _API Token/Key_, save that in GitHub as `PUSHOVER_TOKEN`.

### Testing

The app is configured to run at 8:00 AM daily in Brisbane time so expect a notification tomorrow morning.

You can also manually run it by going to GitHub > Actions > Daily P&L Notification and clicking Run workflow.
