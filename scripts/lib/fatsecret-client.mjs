import { createHmac, randomBytes } from 'node:crypto';

// Never print upstream bodies: errors can echo a signed URL or credentials.
const ERROR_HINTS = {
  '5': 'Invalid OAuth 1 consumer key; use the separately issued OAuth 1 credentials.',
  '8': 'Invalid OAuth 1 signature; check credential pair and request signing.',
  '10': 'Unknown API method.',
  '11': 'Application request limit reached.',
  '12': 'Rate limited.',
  '13': 'Invalid or expired OAuth 2 token.',
  '14': 'Missing scope; check premier access on this exact credential pair.',
  '20': 'Provider temporarily unavailable.',
  '21': 'IP address rejected; check the whitelist for this exact application.',
  '22': 'Invalid request; check parameters and feature access.',
  '23': 'API route not found.',
  '24': 'Provider timeout.',
  '106': 'Invalid food ID.',
  '208': 'Region not accessible.',
};

export function assertApiSuccess(payload, operation = 'API') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`${operation}: invalid JSON envelope`);
  if (payload.error !== undefined) {
    const rawCode = typeof payload.error === 'object' ? payload.error?.code : payload.error;
    const code = /^[a-z0-9_]{1,50}$/i.test(String(rawCode)) ? String(rawCode) : 'unknown';
    throw new Error(`${operation}: FatSecret error ${code}. ${ERROR_HINTS[code] || 'Provider rejected the request; verify account access and credentials.'}`);
  }
  return payload;
}

export async function readApiResponse(response, operation) {
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`${operation}: HTTP ${response.status}, non-JSON response`); }
  assertApiSuccess(payload, operation);
  if (!response.ok) throw new Error(`${operation}: HTTP ${response.status}`);
  return payload;
}

export async function getAccessToken(id, secret) {
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'premier' });
  const response = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  const json = await readApiResponse(response, 'OAuth');
  if (!json.access_token) throw new Error('OAuth response did not contain access_token');
  return json.access_token;
}

export async function searchGenericFoods({ token, query, oauthVersion: version, clientId: id, clientSecret: secret }) {
  return requestFoodApi({ token, oauthVersion: version, clientId: id, clientSecret: secret }, 'foods/search/v5', {
    search_expression: query, food_type: 'generic', include_food_images: 'true',
    max_results: '10', format: 'json',
  });
}

export async function requestFoodApi({token, oauthVersion: version, clientId: id, clientSecret: secret}, route, requestParams) {
  const endpoint = `https://platform.fatsecret.com/rest/${route}`;
  const params = new URLSearchParams(version === '1'
    ? signOAuth1Request('GET', endpoint, requestParams, id, secret)
    : requestParams);

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
    headers: version === '1' ? {
      Accept: 'application/json',
    } : {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  return readApiResponse(response, route);
}

function signOAuth1Request(method, endpoint, requestParams, consumerKey, consumerSecret) {
  const params = {
    ...requestParams,
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  const normalized = Object.entries(params)
    .map(([key, value]) => [oauthEncode(key), oauthEncode(value)])
    .sort(([keyA, valueA], [keyB, valueB]) => {
      if (keyA !== keyB) return keyA < keyB ? -1 : 1;
      if (valueA === valueB) return 0;
      return valueA < valueB ? -1 : 1;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const baseString = [method.toUpperCase(), oauthEncode(endpoint), oauthEncode(normalized)].join('&');
  const signingKey = `${oauthEncode(consumerSecret)}&`;
  params.oauth_signature = createHmac('sha1', signingKey).update(baseString).digest('base64');
  return params;
}

function oauthEncode(value) {
  return encodeURIComponent(String(value))
    .replaceAll('!', '%21')
    .replaceAll("'", '%27')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')
    .replaceAll('*', '%2A');
}

export function normalizeFoods(payload) {
  assertApiSuccess(payload);
  const envelope = payload?.foods_search ?? payload?.foods;
  if (!envelope || typeof envelope !== 'object') throw new Error('Unexpected search response: missing foods_search/foods');
  const raw = payload?.foods_search?.results?.food ?? payload?.foods?.food;
  if (!raw) {
    if (String(envelope.total_results) === '0') return [];
    throw new Error('Unexpected search response: no food records but total_results is not zero');
  }
  const foods = Array.isArray(raw) ? raw : [raw];
  if (foods.some(food => !food || typeof food !== 'object' || !food.food_id || !food.food_name)) {
    throw new Error('Unexpected food record');
  }
  return foods;
}

export function normalizeCandidate(food) {
  const rawImages = food?.food_images?.food_image;
  const images = !rawImages ? [] : (Array.isArray(rawImages) ? rawImages : [rawImages])
    .filter(Boolean)
    .map((image) => ({
      url: image.image_url || '',
      type: image.image_type || '',
    }))
    .filter((image) => image.url);

  return {
    food_id: food.food_id ?? null,
    food_name: food.food_name ?? '',
    food_type: food.food_type ?? '',
    food_url: food.food_url ?? '',
    description: food.food_description ?? '',
    images,
  };
}

