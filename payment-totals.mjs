export function paymentTotals(session,subtotal,automaticTax=false,shippingCents=0) {
  if(!Number.isSafeInteger(shippingCents)||shippingCents<0) throw new Error('Invalid shipping amount');
  if(!Number.isSafeInteger(subtotal)||subtotal<1||session.currency!=='usd') throw new Error('Invalid payment currency or subtotal');
  if(!automaticTax) {
    if(session.metadata?.tax_mode==='automatic' || session.amount_total!==subtotal+shippingCents) throw new Error('Payment total mismatch');
    return {taxCents:0,totalCents:subtotal+shippingCents};
  }
  if(session.metadata?.tax_mode!=='automatic' || session.automatic_tax?.enabled!==true || session.amount_subtotal!==subtotal) throw new Error('Automatic tax or subtotal mismatch');
  const paid=session.status==='complete' && session.payment_status==='paid';
  if(session.automatic_tax.status!=='complete') {
    if(paid) throw new Error('Tax calculation is incomplete');
    return {taxCents:null,totalCents:null};
  }
  const details=session.total_details;
  if(!Number.isSafeInteger(details?.amount_tax) || details.amount_tax<0 || details.amount_discount!==0 || details.amount_shipping!==shippingCents || session.amount_total!==subtotal+shippingCents+details.amount_tax) throw new Error('Tax total mismatch');
  return {taxCents:details.amount_tax,totalCents:session.amount_total};
}
