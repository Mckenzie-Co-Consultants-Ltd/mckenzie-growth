/**
 * POST /api/deleteQaReview — delete a QA review by id + reviewer (partition key).
 * Body: { id, reviewer }
 *
 * Idempotent: returns 200 even if the review didn't exist.
 */

const { database } = require('../shared/cosmos');

const CONTAINER_NAME = 'qaReviews';

module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const id = body.id;
    const reviewer = body.reviewer;

    if (!id) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'id required' } };
      return;
    }
    if (!reviewer) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'reviewer (partition key) required' } };
      return;
    }

    const container = database.container(CONTAINER_NAME);
    let deleted = true;
    try {
      await container.item(id, reviewer).delete();
    } catch (e) {
      if (e.code === 404) {
        deleted = false; // already gone, fine
      } else {
        throw e;
      }
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, deleted },
    };
  } catch (err) {
    context.log.error('deleteQaReview error:', err.message, err.stack);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err.message || 'Unknown error', code: err.code },
    };
  }
};
