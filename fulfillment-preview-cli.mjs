import {orders} from './orders.mjs';
import {createCatalog} from './catalog.mjs';
import {previewFulfillment} from './fulfillment-preview.mjs';

try {
  const [id,zip]=process.argv.slice(2);
  if(!orders || !id || !zip) throw new Error('Usage: node fulfillment-preview-cli.mjs ORDER_ID TEST_ZIP; requires ORDERS_DB_PATH and CJ_API_KEY.');
  const result=await previewFulfillment({order:orders.get(id),hasWebhook:orders.hasWebhook(id),catalog:createCatalog(),zip});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
} catch(error) {
  process.stderr.write(error.message+'\n'); process.exitCode=1;
} finally { orders?.close(); }
