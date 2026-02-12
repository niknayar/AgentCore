/**
 * API Gateway → Bedrock AgentCore Runtime proxy Lambda.
 * Uses raw SigV4-signed HTTP requests with Node.js built-in crypto.
 */
import { createHmac, createHash } from 'node:crypto';
import https from 'node:https';

const REGION = process.env.AWS_REGION || 'us-east-1';
const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN || '';
const ENDPOINT_QUALIFIER = process.env.ENDPOINT_QUALIFIER || '';
const SERVICE = 'bedrock-agentcore';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function sha256Hex(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function getSignatureKey(secret, dateStamp, region, service) {
  let k = hmac(`AWS4${secret}`, dateStamp);
  k = hmac(k, region);
  k = hmac(k, service);
  k = hmac(k, 'aws4_request');
  return k;
}

/**
 * URI-encode per AWS SigV4 spec (RFC 3986), but don't encode '/'.
 * For path segments, we need to encode each segment individually.
 */
function uriEncode(str, encodeSlash = true) {
  let result = '';
  for (const ch of str) {
    if (
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '_' || ch === '-' || ch === '~' || ch === '.'
    ) {
      result += ch;
    } else if (ch === '/' && !encodeSlash) {
      result += ch;
    } else {
      const bytes = new TextEncoder().encode(ch);
      for (const b of bytes) {
        result += `%${b.toString(16).toUpperCase()}`;
      }
    }
  }
  return result;
}

/**
 * Build the canonical URI for SigV4.
 * The path segments must be individually URI-encoded.
 */
function buildCanonicalUri(path) {
  // Split by '/', encode each segment, rejoin
  const segments = path.split('/');
  return segments.map(s => uriEncode(s, true)).join('/');
}

async function invokeAgentRuntime(query) {
  const host = `bedrock-agentcore.${REGION}.amazonaws.com`;

  // The ARN needs to be URI-encoded for the URL path
  const encodedArn = encodeURIComponent(AGENT_RUNTIME_ARN);
  const requestPath = `/runtimes/${encodedArn}/invocations`;

  // For the canonical request, we need to URI-encode the path per SigV4 rules
  // Since encodedArn already has %XX sequences, those % need to be re-encoded
  const canonicalUri = buildCanonicalUri(requestPath);

  const canonicalQueryString = ENDPOINT_QUALIFIER
    ? `qualifier=${uriEncode(ENDPOINT_QUALIFIER)}`
    : '';

  const bodyStr = JSON.stringify({ query });
  const payloadHash = sha256Hex(bodyStr);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const creds = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };

  // Headers for signing (lowercase keys, sorted)
  const headersToSign = {
    'content-type': 'application/json',
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (creds.sessionToken) {
    headersToSign['x-amz-security-token'] = creds.sessionToken;
  }

  const sortedKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedKeys.map(k => `${k}:${headersToSign[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [
    'POST',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');


  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(creds.secretAccessKey, dateStamp, REGION, SERVICE);
  const signature = hmacHex(signingKey, stringToSign);

  const authHeader = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Build actual request headers
  const requestHeaders = {
    'Content-Type': 'application/json',
    'Host': host,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
    'Authorization': authHeader,
  };
  if (creds.sessionToken) {
    requestHeaders['X-Amz-Security-Token'] = creds.sessionToken;
  }

  const fullPath = canonicalQueryString
    ? `${requestPath}?qualifier=${encodeURIComponent(ENDPOINT_QUALIFIER)}`
    : requestPath;


  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      port: 443,
      path: fullPath,
      method: 'POST',
      headers: requestHeaders,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

export async function handler(event) {
  console.log('Lambda invoked');

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

    const query = body?.fields
      ? `Process package submission: ${JSON.stringify(body.fields)}`
      : body?.query || body?.inputText || 'Hello';

    const submissionId = body?.submissionId || `session-${Date.now()}`;
    console.log('Query:', query.substring(0, 200));

    const response = await invokeAgentRuntime(query);
    console.log('HTTP status:', response.statusCode);
    console.log('Body:', response.body.substring(0, 500));

    if (response.statusCode !== 200) {
      console.error('Non-200:', response.statusCode, response.body);
      return {
        statusCode: 503,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          submissionId,
          status: 'error',
          message: 'The agent service returned an error. Please try again later.',
        }),
      };
    }

    // Parse: {"result":{"role":"assistant","content":[{"text":"..."}]}}
    let agentMessage = 'Agent processed the request successfully.';
    try {
      const parsed = JSON.parse(response.body);
      if (parsed.result?.content) {
        agentMessage = parsed.result.content
          .map(c => c.text || '')
          .filter(Boolean)
          .join('\n');
      } else if (parsed.message) {
        agentMessage = parsed.message;
      }
    } catch {
      agentMessage = response.body;
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        submissionId,
        status: 'completed',
        message: agentMessage,
      }),
    };
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        submissionId: '',
        status: 'error',
        message: 'The service is temporarily unavailable. Please try again later.',
      }),
    };
  }
}
