const assert = require('assert');
const path = require('path');

let listener = null;
let seenFetch = null;
const storage = {};
global.chrome = {
  runtime: {
    onMessage: { addListener(fn) { listener = fn; } },
    getManifest() { return { version: '1.1.0' }; }
  },
  storage: {
    local: {
      async get(key) { return {[key]: storage[key]}; },
      async set(obj) { Object.assign(storage, obj); },
      async remove(key) { delete storage[key]; }
    }
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
    listener(message, sender, resolve);
    setTimeout(() => reject(new Error('timeout')), 1500);
  });
}

(async () => {
  const ping = await send({type:'IUCN_CONNECTOR_PING'});
  assert.equal(ping.ok, true);

  const saved = await send({type:'IUCN_TOKEN_SET', token:'abc123'});
  assert.equal(saved.ok, true);
  assert.equal(storage.iucnToken, 'abc123');

  const read = await send({type:'IUCN_TOKEN_GET'});
  assert.equal(read.ok, true);
  assert.equal(read.token, 'abc123');

  const result = await send({
    type:'IUCN_REQUEST',
    path:'/api/v4/taxa/scientific_name?genus_name=Panthera&species_name=leo',
    token:'', timeoutMs:5000
  });
  assert.equal(result.status, 200);
  assert.equal(seenFetch.options.headers.Authorization, 'abc123');
  assert(seenFetch.url.startsWith('https://api.iucnredlist.org/api/v4/taxa/scientific_name'));

  const cleared = await send({type:'IUCN_TOKEN_CLEAR'});
  assert.equal(cleared.ok, true);
  assert.equal(storage.iucnToken, undefined);

  const denied = await send({type:'IUCN_CONNECTOR_PING'}, {url:'https://evil.example/'});
  assert.equal(denied.ok, false);

  const invalid = await send({type:'IUCN_REQUEST', path:'https://example.com/x', token:'abc123'});
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Ruta IUCN no permitida|Destino no permitido/);

  console.log('OK extension_worker: origen, allowlist IUCN, Authorization raw y token local opcional');
})().catch(err => { console.error(err); process.exit(1); });
