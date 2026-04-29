/**
 * /api/qaPing — diagnostic endpoint. Runs a minimal Claude call from inside
 * Azure and returns the full result (or full error detail). Use this to
 * confirm the ANTHROPIC_API_KEY env var works from the Functions runtime.
 *
 * No body required. GET or POST works.
 */

const { Anthropic } = require('@anthropic-ai/sdk');

module.exports = async function (context, req) {
  const rawKey = process.env.ANTHROPIC_API_KEY;
  const cleanedKey = (rawKey || '').trim();

  // Step 1: env var diagnostics — never reveal the secret, just metadata
  const keyInfo = rawKey ? {
    rawLength: rawKey.length,
    trimmedLength: cleanedKey.length,
    hadWhitespace: rawKey.length !== cleanedKey.length,
    startsCorrectly: cleanedKey.startsWith('sk-ant-'),
    firstChars: cleanedKey.slice(0, 12),
    lastChars: cleanedKey.slice(-4),
  } : null;

  if (!cleanedKey) {
    context.res = {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, stage: 'env_var', error: 'ANTHROPIC_API_KEY is empty/missing on the server.', keyInfo },
    };
    return;
  }

  if (!cleanedKey.startsWith('sk-ant-')) {
    context.res = {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: {
        ok: false,
        stage: 'env_var',
        error: `ANTHROPIC_API_KEY value does not start with "sk-ant-". First 12 chars: "${keyInfo.firstChars}". Re-paste the key in Azure Configuration.`,
        keyInfo,
      },
    };
    return;
  }

  // Step 2: actually call Anthropic
  try {
    const client = new Anthropic({ apiKey: cleanedKey });
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5',   // cheapest fastest model — just verifying connectivity
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Reply with just the two letters: OK' }],
    });
    const text = (resp.content.find(b => b.type === 'text') || {}).text || '';
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        ok: true,
        stage: 'anthropic_call',
        model: resp.model,
        reply: text.trim(),
        usage: resp.usage,
        keyInfo,
      },
    };
  } catch (err) {
    // Capture every diagnostic field the SDK exposes
    const detail = {
      ok: false,
      stage: 'anthropic_call',
      error: err.message || 'Unknown error',
      errorClass: err && err.constructor ? err.constructor.name : typeof err,
      status: err.status,
      requestId: err.request_id || (err.headers && (err.headers['request-id'] || err.headers['x-request-id'])),
      anthropicError: err.error,
      keyInfo,
    };
    context.log.error('qaPing error:', JSON.stringify(detail));
    context.res = {
      status: err.status || 500,
      headers: { 'Content-Type': 'application/json' },
      body: detail,
    };
  }
};
