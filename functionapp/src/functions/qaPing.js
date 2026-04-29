/**
 * /api/qaPing — diagnostic endpoint. Calls Anthropic from inside Azure using
 * Node's built-in https module (no SDK dependency). Returns key metadata
 * + raw HTTPS result.
 *
 * V4 programming model.
 */

const { app } = require('@azure/functions');
const https = require('https');

function rawAnthropicCall(apiKey) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: chunks, headers: res.headers }));
    });
    req.on('error', (err) => resolve({ status: 0, body: '', error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

app.http('qaPing', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const rawKey = process.env.ANTHROPIC_API_KEY;
    const cleanedKey = (rawKey || '').trim();

    const keyInfo = rawKey ? {
      rawLength: rawKey.length,
      trimmedLength: cleanedKey.length,
      hadWhitespace: rawKey.length !== cleanedKey.length,
      startsCorrectly: cleanedKey.startsWith('sk-ant-'),
      firstChars: cleanedKey.slice(0, 12),
      lastChars: cleanedKey.slice(-4),
    } : null;

    if (!cleanedKey) {
      return {
        status: 503,
        jsonBody: { ok: false, stage: 'env_var', error: 'ANTHROPIC_API_KEY is empty/missing on the server.', keyInfo },
      };
    }

    if (!cleanedKey.startsWith('sk-ant-')) {
      return {
        status: 502,
        jsonBody: {
          ok: false,
          stage: 'env_var',
          error: `ANTHROPIC_API_KEY value does not start with "sk-ant-".`,
          keyInfo,
        },
      };
    }

    const rawResult = await rawAnthropicCall(cleanedKey);
    let rawParsed = null;
    try { rawParsed = JSON.parse(rawResult.body); } catch { /* leave null */ }

    const ok = rawResult.status === 200;
    const out = {
      ok,
      keyInfo,
      rawHttps: {
        ok,
        status: rawResult.status,
        requestId: rawResult.headers && rawResult.headers['request-id'],
        reply: rawParsed && rawParsed.content ? (rawParsed.content[0] || {}).text : null,
        bodySnippet: rawResult.body ? rawResult.body.slice(0, 300) : null,
        error: rawResult.error || null,
      },
      sdk: { ok, skipped: true, reason: 'Using built-in https module only; no SDK installed' },
    };
    context.log('qaPing result:', JSON.stringify({ ok: out.ok, status: rawResult.status, requestId: out.rawHttps.requestId }));

    return {
      status: ok ? 200 : 502,
      jsonBody: out,
    };
  },
});
