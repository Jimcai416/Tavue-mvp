const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tavue-worker-'));
(async () => {
  for (const [source, output] of [['shared/dishPhotoCatalog.ts','dishPhotoCatalog.js'],['shared/dishPhotos.ts','dishPhotos.js'],['shared/referencePhoto.ts','referencePhoto.js'],['worker/src/photoCatalog.js','photoCatalog.js'],['worker/src/index.js','index.js'],['worker/src/entry.js','entry.js']]) {
    const code = fs.readFileSync(source,'utf8').replaceAll('../../shared/dishPhotos.ts','./dishPhotos.js').replaceAll('../../shared/dishPhotoCatalog.ts','./dishPhotoCatalog.js').replaceAll('../../shared/referencePhoto.ts','./referencePhoto.js');
    fs.writeFileSync(path.join(temp,output),ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  }
  const worker = require(path.join(temp,'index.js')).default;
  const upstream = {cuisine:'Italian',dishes:[
    {original_name:'Pasta alla Norma',image_url:'https://unreviewed.invalid/photo.jpg'},
    {original_name:'Chicken carbonara',image_dish_name:'Spaghetti Carbonara'},
    {original_name:'Unknown dish',image_id:'mapo-tofu'},
  ]};
  const cache = new Map();
  const env = {ANTHROPIC_API_KEY:'test-only',REQUIRE_CLIENT_ID:'true',FEEDBACK:{get:async k=>cache.get(k),put:async(k,v)=>cache.set(k,v)}};
  let requests = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    requests++;
    assert.equal(url,'https://api.anthropic.com/v1/messages','No image provider requests allowed');
    assert.ok(JSON.parse(options.body).system.includes('canonical English name'));
    return Response.json({content:[{type:'text',text:JSON.stringify(upstream)}]});
  };
  try {
    const request = () => new Request('https://worker.test/scan',{method:'POST',headers:{'Content-Type':'application/json','x-tavue-client':'test-client-12345'},body:JSON.stringify({imageBase64:'test-fixture',scanSessionId:'scan-fixture-12345'})});
    const response = await worker.fetch(request(),env);
    assert.equal(response.status,200);
    const data = await response.json();
    assert.deepEqual(data.dishes.map(d=>d.image_id),['pasta-alla-norma',null,null]);
    assert.ok(data.dishes.every(d=>d.image_url === null));
    // Simulate a result cached by the previous worker, containing unsafe URLs/IDs.
    for (const key of cache.keys()) cache.set(key,JSON.stringify(upstream));
    const resumed = await worker.fetch(request(),env);
    assert.equal(resumed.headers.get('X-Tavue-Scan-Resume'),'hit');
    assert.deepEqual((await resumed.json()).dishes.map(d=>d.image_id),['pasta-alla-norma',null,null]);
    assert.equal(requests,1,'Resume must not call AI or image search');
    const entry = require(path.join(temp,'entry.js')).default;
    const routed = await entry.fetch(new Request('https://app.test/photos/missing/'+'a'.repeat(64)+'.jpg'),{ASSETS:{fetch:async()=>new Response('SPA')}});
    assert.equal(routed.status,404,'Photo paths must reach the API, not return SPA HTML');
    console.log('PASS: fresh scan, cached scan migration, rejected variants, and zero image-provider requests.');
  } finally { global.fetch = originalFetch; }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
