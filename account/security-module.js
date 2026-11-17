// Security Module proofs are never saved. Each belongs to one account, session
// and reviewed action. Password/passkey reauthentication stays in Account.
export async function protectedPost({path,body,owner,current,call}){
 const payload=structuredClone(body),action=path==='export'?'account-export':path==='delete'?'account-delete':'account-devices',target=path==='devices/end'?(payload.others?'others':payload.stale?'stale':String(payload.id||'')):owner;
 const check=()=>{if(!current())throw new Error('Your account changed. Reopen this action.');};check();
 const approval=await call('security/confirmation',{method:'POST',body:{action,target},owner});check();
 const result=await call(path,{method:'POST',body:{...payload,securityTicket:approval.token},owner});check();return result;
}
