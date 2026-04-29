/**
 * GET /api/listQaReviews — paginated list of QA reviews with filters.
 *
 * Query params:
 *   scope     'mine' | 'all'   default 'all'
 *   reviewer  reviewer name    required when scope='mine'
 *   limit     1-500            default 50
 *   offset    >=0              default 0
 *
 * Returns: { reviews: [...], total: N, limit, offset, scope }
 *
 * Sorted by date DESC (most recent first).
 */

const { database } = require('../shared/cosmos');

const CONTAINER_NAME = 'qaReviews';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

module.exports = async function (context, req) {
  try {
    const scope = (req.query.scope || 'all').toLowerCase();
    const reviewer = req.query.reviewer || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    if (scope === 'mine' && !reviewer) {
      context.res = { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'reviewer query param required when scope=mine' } };
      return;
    }

    const container = database.container(CONTAINER_NAME);

    // Build the SELECT and COUNT queries — same WHERE clause for both
    const where = scope === 'mine' ? 'WHERE c.reviewer = @reviewer' : '';
    const params = scope === 'mine' ? [{ name: '@reviewer', value: reviewer }] : [];

    const listQuery = {
      query: `SELECT * FROM c ${where} ORDER BY c.date DESC OFFSET @offset LIMIT @limit`,
      parameters: [
        ...params,
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ],
    };

    const countQuery = {
      query: `SELECT VALUE COUNT(1) FROM c ${where}`,
      parameters: params,
    };

    const queryOpts = scope === 'mine' ? { partitionKey: reviewer } : { enableCrossPartitionQuery: true };

    const [{ resources }, { resources: countResults }] = await Promise.all([
      container.items.query(listQuery, queryOpts).fetchAll(),
      container.items.query(countQuery, queryOpts).fetchAll(),
    ]);

    // Strip Cosmos system fields before returning
    const cleaned = resources.map(r => {
      const { _rid, _self, _etag, _attachments, _ts, ...rest } = r;
      return rest;
    });

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        reviews: cleaned,
        total: countResults[0] || 0,
        limit,
        offset,
        scope,
      },
    };
  } catch (err) {
    // If the container doesn't exist yet, return an empty result rather than 500
    if (err.code === 404 && /NotFound/i.test(err.message || '')) {
      context.log.warn('qaReviews container not found yet — returning empty list');
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { reviews: [], total: 0, limit: 0, offset: 0, scope: 'all', containerMissing: true },
      };
      return;
    }
    context.log.error('listQaReviews error:', err.message, err.stack);
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err.message || 'Unknown error', code: err.code },
    };
  }
};
