const { createClient } = require('/app/server/node_modules/@supabase/supabase-js');
const { Configuration, PlaidApi, PlaidEnvironments } = require('/app/server/node_modules/plaid');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
}));

(async () => {
  const { data: items } = await sb.from('plaid_items')
    .select('item_id, access_token, institution_name')
    .eq('institution_name', 'Connected Bank');

  if (!items || items.length === 0) {
    console.log('No "Connected Bank" items found');
    return;
  }

  for (const item of items) {
    try {
      const r = await plaid.itemGet({ access_token: item.access_token });
      const instId = r.data.item.institution_id;
      if (instId) {
        const ir = await plaid.institutionsGetById({
          institution_id: instId,
          country_codes: ['US'],
        });
        const name = ir.data.institution.name;
        await sb.from('plaid_items').update({ institution_name: name }).eq('item_id', item.item_id);
        console.log(`Updated ${item.item_id} → ${name}`);
      }
    } catch (err) {
      console.error(`Failed for ${item.item_id}:`, err.message);
    }
  }
})();
