'use strict';

const aws = require('aws-sdk');
const uuidV4 = require('uuid/v4');

aws.config.update({ region: 'us-east-1' });
if (process.env.IS_OFFLINE) {
  aws.config.update({ endpoint: 'http://localhost:4000' });
}
const ddb = new aws.DynamoDB.DocumentClient();

module.exports.test = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'OK'
    })
  }
}

module.exports.paypalTxnComplete = async (event, context) => {
  let logger;
  if (process.env.IS_OFFLINE) {
    const pino = require('pino');
    logger = pino({
      prettyPrint: {
        levelFirst: true
      }
    });
  } else {
    logger = require('pino')();
  }
  const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
  const payPalClient = require('./lib/paypalClient');
  const body = JSON.parse(event.body);
  const orderID = body.orderID;
  let request = new checkoutNodeJssdk.orders.OrdersGetRequest(orderID);
  let order;

  try {
    order = await payPalClient.client().execute(request);
  } catch (err) {
    logger.error('pp client error', err, '\n', err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Could not execute client request'
      })
    }
  }

  // logger.info(order);

  const params = {
    TableName: 'PaymentTransactions',
    Item: {
      txnId: uuidV4(),
      payerEmail: order.result.payer.email_address,
      vendorTxnId: order.result.id,
      amount: order.result.purchase_units[0].payments.captures[0].amount.value,
      payerGivenName: order.result.payer.name.given_name,
      payerSurname: order.result.payer.name.surname,
      vendorName: "PayPal",
      fullTxnObject: order.result,
    }
  }

  try {
    // const dbresult = await ddb.putItem(params).promise();
    const dbresult = await ddb.put(params).promise();
    logger.info(dbresult);
  } catch (err) {
    logger.error('db error', err, '\n', err.stack); 
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Could not execute DB put'
      })
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'OK'
    })
  }

};
