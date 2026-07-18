import test from "node:test";
import assert from "node:assert/strict";
import { MarketBoard } from "./market.js";

function activeToothbrush(board, priceMinor = 19900) {
  const merchant = board.registerMerchant({
    displayName: "Hancock Store",
    operatingRegions: ["CN"],
    policyAcceptances: [{ id: "cn-general-goods", version: "1" }],
  });
  board.verifyMerchant(merchant.id);
  const listing = board.createListing(merchant.id, {
    title: "Sonic electric toothbrush",
    summary: "Soft brush, USB-C charging",
    category: "personal-care",
    priceMinor,
    currency: "CNY",
    shippingRegions: ["CN"],
    policyId: "cn-general-goods",
    policyVersion: "1",
  });
  board.setListingCompliance(listing.id, {
    status: "active",
    policyId: "cn-general-goods",
    policyVersion: "1",
  });
  return listing;
}

test("Codex can filter active listings by text, budget, and shipping region", () => {
  const board = new MarketBoard();
  activeToothbrush(board, 19900);
  activeToothbrush(board, 39900);
  const results = board.search({
    text: "toothbrush",
    maxPriceMinor: 30000,
    currency: "CNY",
    shippingRegion: "CN",
    sort: "price",
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].priceMinor, 19900);
  assert.ok(results[0].ranking.explanation);
});

test("blocked listings cannot be ordered", () => {
  const board = new MarketBoard();
  const listing = activeToothbrush(board);
  board.setListingCompliance(listing.id, {
    status: "blocked",
    policyId: "cn-general-goods",
    policyVersion: "2",
    reasonCode: "RULE_CHANGED",
  });
  assert.throws(() => board.previewOrder({ listingId: listing.id }), /not orderable/);
});

test("merchant edits return an active listing to compliance review", () => {
  const board = new MarketBoard();
  const listing = activeToothbrush(board);
  const updated = board.updateListing(listing.id, listing.merchantId, { priceMinor: 20900 });
  assert.equal(updated.priceMinor, 20900);
  assert.equal(updated.compliance.status, "review");
  assert.equal(updated.compliance.reasonCode, "MERCHANT_EDIT");
});

test("an order requires buyer confirmation and a verified webhook to become paid", () => {
  const board = new MarketBoard();
  const listing = activeToothbrush(board);
  assert.throws(
    () => board.createOrder({ listingId: listing.id, buyerId: "Luffy" }),
    /confirmation/,
  );
  const order = board.createOrder({
    listingId: listing.id,
    buyerId: "Luffy",
    buyerConfirmed: true,
  });
  assert.equal(order.status, "awaiting_payment");
  assert.throws(
    () => board.recordVerifiedPayment({ orderId: order.id, paymentReference: "fake", webhookVerified: false }),
    /verified payment webhook/,
  );
  const paid = board.recordVerifiedPayment({
    orderId: order.id,
    paymentReference: "pay_123",
    webhookVerified: true,
  });
  assert.equal(paid.status, "paid");
  assert.equal(paid.paymentVerification, "provider");
});

test("simulated payment completes the workflow without polluting verified ranking", () => {
  const board = new MarketBoard();
  const listing = activeToothbrush(board);
  const order = board.createOrder({ listingId: listing.id, buyerId: "Luffy", buyerConfirmed: true });
  const paid = board.recordSimulatedPayment({ orderId: order.id, paymentReference: "mock_123", simulationAuthorized: true });
  assert.equal(paid.status, "paid");
  assert.equal(paid.paymentVerification, "simulated");
  board.updateOrderStatus({ orderId: order.id, status: "accepted" });
  board.updateOrderStatus({ orderId: order.id, status: "fulfilled" });
  board.updateOrderStatus({ orderId: order.id, status: "completed", fulfilledOnTime: true });
  const comment = board.addComment({ listingId: listing.id, orderId: order.id, authorId: "Luffy", body: "Test trade" });
  assert.equal(comment.verifiedPurchase, false);
  assert.equal(comment.simulatedPurchase, true);
  assert.equal(board.getPublicListing(listing.id).ranking.explanation.completedOrders, 0);
});
