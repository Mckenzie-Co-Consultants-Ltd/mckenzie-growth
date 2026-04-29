/**
 * POST /api/saveQaReview — upsert a single QA review document into Cosmos.
 * Body: the full review object (with id and reviewer fields required).
 * Cosmos container: qaReviews, partition key /reviewer.
 */

const { database } = require('../shared/cosmos');

const CONTAINER_NAME = 'qaReviews';

module.exports = async function (context, req) {
  try {
    const review = req.body;
    if (!review || typeof review !== 'object') {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'Body must be a review object' } };
      return;
    }
    if (!review.id) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'review.id is required' } };
      return;
    }
    if (!review.reviewer) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'review.reviewer is required (partition key)' } };
      return;
    }

    const container = database.container(CONTAINER_NAME);
    const { resource } = await container.items.upsert(review);

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, id: resource.id, etag: resource._etag },
    };
  } catch (err) {
    context.log.error('saveQaReview error:', err.message, err.stack);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err.message || 'Unknown error', code: err.code },
    };
  }
};
