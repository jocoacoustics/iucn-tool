const assert = require('assert');
const path = require('path');
let calls = [];

globalThis.IUCNExtensionBridge = {
  async request(url, token) {
    calls.push({url, token});
    const u = new URL(url);
    const genus = u.searchParams.get('genus_name');
    const species = u.searchParams.get('species_name');
    const name = `${genus} ${species}`;
    return {
      ok: true, status: 200,
      headers: {'content-type':'application/json'},
      body: {
        taxon: {
          scientific_name: name,
          kingdom_name: 'Animalia', phylum_name:'Chordata', class_name:'Mammalia',
          order_name:'Carnivora', family_name:'Felidae', genus_name:genus, species_name:species,
          sis_taxon_id: 15951
        },
        assessments: [{assessment_id: 1, latest: true, year_published: 2023, red_list_category_code:'VU', scopes:[{code:'1'}], url:'https://example.test'}]
      }
    };
  }
};
const core = require(path.resolve(__dirname, '../assets/js/iucn-core.js'));

(async () => {
  const one = await core.queryOne('Panthera leo', 'TOKEN', {allowSisFallback:false});
  assert.equal(one.scientificNameApiFound, 'Panthera leo');
  assert.equal(one.lastAssessmentCode, 'VU');
  assert.equal(calls[0].token, 'TOKEN');
  assert(calls[0].url.startsWith('https://api.iucnredlist.org/api/v4/taxa/scientific_name?'));

  calls = [];
  const rows = await core.queryMany(['Panthera leo', ' panthera   leo ', 'Canis lupus'], 'TOKEN', {concurrency:4, allowSisFallback:false});
  assert.equal(calls.length, 2, `esperaba 2 consultas únicas, recibí ${calls.length}`);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].lastAssessmentCode, 'VU');
  assert.equal(rows[1].scientificNameConsulted, 'panthera leo');
  console.log('OK core_extension_transport: API v4 directa por extensión + deduplicación');
})().catch(err => { console.error(err); process.exit(1); });
