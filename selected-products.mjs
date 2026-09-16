// Prices approved by the store owner. Variant approval is separate from price approval.
export const selectedProducts = [
  {slug:'electric-baking-pan', lookup:{pid:'2502240123311602100'}, category:'kitchen', name:'30 cm Electric Baking Pan',retailCents:8999, origin:'CN', includedShipping:true, optionNote:'American Standard version. Standard shipping included where available. Voltage and frequency are not independently verified.',pricedVariants:[{id:'2502240123311602500',name:'Black · American Standard',retailCents:8999}]},
  {slug:'waterfall-faucet-attachment', lookup:{pid:'1696373349800226816'}, category:'kitchen', name:'Rotating Waterfall Faucet Attachment', retailCents:2299, origin:'CN', includedShipping:true, optionNote:'Single attachment in black or silver. Check your faucet connection before ordering. Standard shipping included where available. Multipack pricing is pending.',
    pricedVariants:[
      {id:'1696373349829586944',name:'Silver · 1 attachment',retailCents:2299},
      {id:'1696373349854752768',name:'Black · 1 attachment',retailCents:2299}
    ]},
  {slug:'mushroom-night-light',lookup:{pid:'1605139484134354944'},category:'home-improvement',name:'Wooden Mushroom Touch Night Light',retailCents:3999,origin:'CN',includedShipping:true,optionNote:'Choose style A, B, C or D in beech or walnut. Each option is $39.99. Standard shipping included where available.',pricedVariants:[
    {id:'1605139484167909376',name:'A · Walnut',retailCents:3999},
    {id:'1605139484172103680',name:'A · Beech',retailCents:3999},
    {id:'1605139484172103681',name:'B · Walnut',retailCents:3999},
    {id:'1605139484176297984',name:'B · Beech',retailCents:3999},
    {id:'1605139484176297985',name:'C · Walnut',retailCents:3999},
    {id:'1605139484180492288',name:'C · Beech',retailCents:3999},
    {id:'1605139484180492289',name:'D · Walnut',retailCents:3999},
    {id:'1605139484180492290',name:'D · Beech',retailCents:3999}
  ]}
];
export const retailPrice = p => Number.isInteger(p.retailCents) ? '$'+(p.retailCents/100).toFixed(2) : null;
