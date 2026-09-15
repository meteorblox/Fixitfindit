// Prices approved by the store owner. Variant approval is separate from price approval.
export const selectedProducts = [
  {slug:'electric-baking-pan', lookup:{variantSku:'CJJT230511001AZ'}, category:'kitchen', name:'30 cm Electric Baking Pan', retailCents:9000, origin:'CN', optionNote:'American Standard version. Voltage and delivery confirmation pending.'},
  {slug:'waterfall-faucet-attachment', lookup:{pid:'1696373349800226816'}, category:'kitchen', name:'Rotating Waterfall Faucet Attachment', retailCents:1700, origin:'CN', optionNote:'Single attachment in black or silver. Check your faucet connection before ordering. Multipack pricing is pending.',
    pricedVariants:[
      {id:'1696373349829586944',name:'Silver · 1 attachment',retailCents:1700},
      {id:'1696373349854752768',name:'Black · 1 attachment',retailCents:1700}
    ]},
  {slug:'mushroom-night-light',lookup:{pid:'1605139484134354944'},category:'home-improvement',name:'Wooden Mushroom Touch Night Light',retailCents:4000,origin:'CN',optionNote:'Styles A–D in beech or walnut. Variant matching is being checked before checkout is enabled.'}
];
export const retailPrice = p => Number.isInteger(p.retailCents) ? '$'+(p.retailCents/100).toFixed(2) : null;
