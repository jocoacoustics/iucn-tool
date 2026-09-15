const assert = require('assert');
const path = require('path');

let listener = null;
let seenFetch = null;
global.chrome = {
  runtime: {
    onMessage: { addListener(fn) { listener = fn; } },
    getManifest() { return { version: '1.0.0' }; }
  }
};
global.fetch = async (url, options) => {
  seenFetch = { url, options };
  return {
    ok: true,
    status: 200,
    headers: { get(name) { return name.toLowerCase() === 'content-type' ? 'application/json' : null; } },
    async text() { return JSON.stringify({ taxon: { scientific_name: 'Panthera leo' }, assessments: [] }); }
  };
};
require(path.resolve(__dirname, '../extension/service-worker.js'));
assert(listener, 'service worker listener no registrado');

function send(message, sender={url:'https://jocoacoustics.github.io/iucn-tool/'}) {
  return new Promise((resolve, reject) => {
    const ret = listener(message, sender, resolve);
    if (ret !== true) setTimeout(() => resolve.__unused, 0);
    setTimeout(() => reject(new Error('timeout')), 1500);
  });
}

(async () => {
  const ping = await new Promise(resolve => listener({type:'IUCN_CONNECTOR_PING'}, {url:'https://jocoacoustics.github.io/x/'}, resolve));
  assert.equal(ping.ok, true);

  const result = await send({
    type:'IUCN_REQUEST',
    path:'/api/v4/taxa/scientific_name?genus_name=Panthera&species_name=leo',
    token:'abc123', timeoutMs:5000
  });
  assert.equal(result.status, 200);
  assert.equal(seenFetch.options.headers.Authorization, 'abc123');
  assert(seenFetch.url.startsWith('https://api.iucnredlist.org/api/v4/taxa/scientific_name'));

  const denied = await new Promise(resolve => listener(
    {type:'IUCN_CONNECTOR_PING'},
    {url:'https://evil.example/'},
    resolve
  ));
  assert.equal(denied.ok, false);

  const invalid = await send({type:'IUCN_REQUEST', path:'https://example.com/x', token:'abc123'});
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Ruta IUCN no permitida|Destino no permitido/);

  console.log('OK extension_worker: origen, allowlist IUCN y Authorization raw');
})().catch(err => { console.error(err); process.exit(1); });
