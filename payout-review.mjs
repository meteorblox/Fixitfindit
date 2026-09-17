export const payoutTerms={minimumCents:2500,holdDays:30,schedule:'monthly'};
export function payoutReview(rows,{now=Date.now(),mode='sandbox',period=new Date(now).toISOString().slice(0,7)}={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!['sandbox','live'].includes(mode))throw Error('Invalid payout review');
 const cutoff=Date.parse(period+'-01T00:00:00Z');if(cutoff>now)throw Error('Future payout period');
 const entries=rows.map(r=>{const created=Date.parse(r.created_at);let reason=r.mode!=='live'||r.partner_id.startsWith('demo-')?'test_order':!Number.isFinite(created)||created+30*86400000>cutoff?'30_day_hold':r.pendingRefund||r.fulfillmentHold?'refund_review':r.netCommissionCents<=0?'no_balance':null;return {orderId:r.order_id,commissionCents:r.netCommissionCents,reason};});
 const eligible=entries.filter(r=>!r.reason),eligibleCents=eligible.reduce((n,r)=>n+r.commissionCents,0);
 return {period,mode,minimumCents:2500,holdDays:30,eligibleCents,meetsMinimum:eligibleCents>=2500,reviewAmountCents:mode==='live'&&eligibleCents>=2500?eligibleCents:0,payableCents:0,status:'review_only',entries,notice:'Review only. No payment is authorized or sent. Verify fulfillment, disputes, prior payouts, payee and current refunds before approving a payout.'};
}
