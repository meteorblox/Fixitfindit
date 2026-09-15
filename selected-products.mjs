// Prices approved by the store owner. Variant approval is separate from price approval.
export const selectedProducts = [
  {slug:'electric-baking-pan', lookup:{variantSku:'CJJT230511001AZ'}, category:'kitchen', name:'30 cm Electric Baking Pan', retailCents:9000, origin:'CN', optionNote:'American Standard version. Voltage and delivery confirmation pending.'},
  {slug:'waterfall-faucet-attachment', lookup:{pid:'1696373349800226816'}, category:'kitchen', name:'Rotating Waterfall Faucet Attachment', retailCents:null, origin:'CN', optionNote:'Silver single attachment. Retail price being revised; faucet compatibility confirmation pending.'}
];
export const retailPrice = p => Number.isInteger(p.retailCents) ? '$'+(p.retailCents/100).toFixed(2) : null;
