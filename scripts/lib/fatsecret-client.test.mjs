import test from 'node:test';
import assert from 'node:assert/strict';
import {readApiResponse, normalizeFoods, normalizeCandidate, searchGenericFoods} from './fatsecret-client.mjs';

const food = {food_id: '1641', food_name: 'Chicken Breast', food_type: 'Generic'};
test('HTTP 200 API rejection is an error, never empty coverage', async () => {
  await assert.rejects(readApiResponse(Response.json({error: {code:'14', message:'secret=DO_NOT_PRINT'}}), 'search'), /Missing scope/);
  await assert.rejects(readApiResponse(Response.json({error: {code:'21', message:'secret=DO_NOT_PRINT'}}), 'search'), error => !error.message.includes('DO_NOT_PRINT') && error.message.includes('IP address rejected'));
});
test('OAuth JSON errors and non-JSON failures are safe', async () => {
  await assert.rejects(readApiResponse(Response.json({error:'invalid_client', error_description:'DO_NOT_PRINT'}, {status:400}), 'OAuth'), /invalid_client/);
  await assert.rejects(readApiResponse(new Response('DO_NOT_PRINT',{status:502}), 'search'), /502, non-JSON/);
});
test('only explicit zero results counts as a genuine empty search', () => {
  assert.deepEqual(normalizeFoods({foods_search:{total_results:'0'}}), []);
  assert.throws(() => normalizeFoods({error:{code:14}}), /scope/);
  assert.throws(() => normalizeFoods({unexpected:[]}), /missing/);
  assert.throws(() => normalizeFoods({foods_search:{total_results:'20'}}), /no food records/);
});
test('documented nested arrays and singleton records both parse', () => {
  assert.deepEqual(normalizeFoods({foods_search:{results:{food:[food]}}}), [food]);
  assert.deepEqual(normalizeFoods({foods_search:{results:{food}}}), [food]);
  assert.deepEqual(normalizeFoods({foods:{food}}), [food]);
});
test('singleton and array images survive normalization', () => {
  const img = {image_url:'https://example.com/dish.png', image_type:'1'};
  assert.equal(normalizeCandidate({...food, food_images:{food_image:img}}).images.length, 1);
  assert.equal(normalizeCandidate({...food, food_images:{food_image:[img,img]}}).images.length, 2);
});
test('search requests generic images from default US dataset, with timeout', async (t) => {
  t.mock.method(globalThis,'fetch',async (url, options) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('include_food_images'), 'true');
    assert.equal(query.get('food_type'), 'generic');
    assert.equal(query.has('region'), false);
    assert.equal(options.headers.Authorization, 'Bearer test');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({foods_search:{results:{food}}});
  });
  const result = await searchGenericFoods({token:'test',oauthVersion:'2',query:'chicken breast'});
  assert.equal(normalizeFoods(result).length,1);
});
test('OAuth 1 search remains signed and does not send a bearer token', async (t) => {
  t.mock.method(globalThis,'fetch',async (url, options) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('oauth_signature_method'),'HMAC-SHA1');
    assert.ok(query.get('oauth_signature'));
    assert.equal(options.headers.Authorization,undefined);
    return Response.json({foods_search:{total_results:'0'}});
  });
  await searchGenericFoods({oauthVersion:'1',clientId:'test',clientSecret:'test',query:'test'});
});
