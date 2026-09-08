const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const ts=require('typescript');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tavue-photo-scale-'));
(async()=>{
  for(const [source,target] of [['shared/dishPhotoCatalog.ts','dishPhotoCatalog.js'],['shared/dishPhotos.ts','dishPhotos.js'],['shared/referencePhoto.ts','referencePhoto.js'],['worker/src/photoCatalog.js','photoCatalog.js']]){
    const code=fs.readFileSync(source,'utf8').replaceAll('../../shared/dishPhotos.ts','./dishPhotos.js').replaceAll('../../shared/referencePhoto.ts','./referencePhoto.js');
    fs.writeFileSync(path.join(temp,target),ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  }
  const {attachCataloguePhotos,serveCataloguePhoto}=require(path.join(temp,'photoCatalog.js'));
  const {validReferencePhoto}=require(path.join(temp,'referencePhoto.js'));
  const seed=require(path.join(temp,'dishPhotoCatalog.js')).dishPhotoCatalog[0];
  const remote={...seed,id:'commons-999',name:'Test recipe',aliases:[],deliveryPath:'/photos/commons-999/'+ 'a'.repeat(64)+'.jpg'};
  assert.equal(validReferencePhoto(remote),true);
  assert.equal(validReferencePhoto({...remote,deliveryPath:'https://unapproved.invalid/photo.jpg'}),false);
  assert.equal(validReferencePhoto({...remote,license:'CC BY-NC 4.0'}),false);
  // Test 160 distinct dishes against an actual indexed SQLite catalogue with
  // 10,000 SYNTHETIC rows. These do not count as real photographs or coverage.
  const db=path.join(temp,'scale.sqlite');
  const setup=`import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()`;
  const statements=[fs.readFileSync('catalog/schema.sql','utf8')];
  const q=x=>"'"+String(x).replaceAll("'","''")+"'";
  for(let i=0;i<10000;i++){
    const id='test-'+i, name='Test recipe '+i;
    const meta={...remote,id,name,deliveryPath:'/photos/'+id+'/'+'a'.repeat(64)+'.jpg'};
    statements.push(`INSERT INTO photo_dishes VALUES('${id}',${q(name)},'Test','${id}'); INSERT INTO photo_aliases VALUES(${q(name.toLowerCase())},'${id}'); INSERT INTO approved_photos VALUES('${id}','${id}','approved','${'a'.repeat(64)}','${id}.jpg','image/jpeg',${q(JSON.stringify(meta))},'test','2026-09-07');`);
  }
  execFileSync(process.env.PYTHON || 'python',['-c',setup,db],{input:statements.join('\n')});
  let queries=0;
  const query=(sql,params)=>JSON.parse(execFileSync(process.env.PYTHON || 'python',['-c',`import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row;p=json.load(sys.stdin);rows=[dict(x) for x in c.execute(p['sql'],p['params'])];c.commit();print(json.dumps(rows))`,db],{input:JSON.stringify({sql,params}),encoding:'utf8'}));
  const env={PHOTO_CATALOG:{prepare(sql){return{bind(...params){assert.ok(params.length<=100);return{all:async()=>{queries++;return {results:query(sql,params)};},first:async()=>query(sql,params)[0]||null};}};}},PHOTO_BUCKET:{get:async()=>({body:'test-image-bytes'})}};
  const dishes=Array.from({length:160},(_,i)=>({original_name:'Test recipe '+i}));
  const resolved=await attachCataloguePhotos(dishes,env);
  assert.equal(resolved.filter(d=>d.reference_photo).length,160);
  assert.equal(queries,2,'Indexed chunks, not one query per dish or catalogue-wide loading');
  const selected=resolved[0].reference_photo;
  const good=await serveCataloguePhoto(new Request('https://app.test'+selected.deliveryPath),env);
  assert.equal(good.status,200);
  assert.equal(good.headers.get('Content-Type'),'image/jpeg');
  const wrong=await serveCataloguePhoto(new Request('https://app.test'+selected.deliveryPath.replace('a'.repeat(64),'b'.repeat(64))),env);
  assert.equal(wrong.status,404);
  query("UPDATE approved_photos SET status='withdrawn' WHERE id=?",['test-0']);
  assert.equal((await serveCataloguePhoto(new Request('https://app.test'+selected.deliveryPath),env)).status,404);
  assert.equal((await attachCataloguePhotos([{original_name:'Test recipe 0'}],env))[0].reference_photo,null);
  const down=await attachCataloguePhotos([{original_name:'Pasta alla Norma'}],{PHOTO_BUCKET:{},PHOTO_CATALOG:{prepare(){throw new Error('outage')}}});
  assert.equal(down[0].image_id,'pasta-alla-norma');
  console.log('PASS: 10,000-row synthetic SQL catalogue, 160 dish matches in 2 indexed queries, safe delivery paths, hash mismatch, withdrawal and outage fallback.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
