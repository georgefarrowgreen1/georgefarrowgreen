// Only loaded by an explicit recovery request inside an unlocked conversation.
export async function openRecovery(ctx,id,{current,read,apply,freeze=()=>{}}){
 const {fw,svc}=ctx,ui=fw.ui,el=ui.el,body=el('div',{}),status=el('p',{role:'status',text:'Checking encrypted copies…'});body.append(status);
 const h=fw.sheet.open({sheet:'chat-draft-recovery',title:'Recover a draft',body});
 const live=()=>!fw.signal.aborted&&!h.closed&&current();
 try{const values=await svc.call('draftCopies',id);if(!live())return;status.textContent=values.length?'Choose a copy to review. It will not be sent.':'No draft copies from other remembered devices for this chat.';
  for(const value of values){const preview=el('p',{text:value.preview}),date=el('p',{text:new Date(value.updatedAt).toLocaleString()});
   body.append(el('section',{class:'ifl-group'},date,preview,ui.btn('Use this draft',{run:async()=>{
    if(!live())return;const expected=read();
    const confirm=fw.sheet.open({sheet:'chat-draft-confirm',title:'Replace the current draft?',body:el('p',{text:'This replaces the text in the message box. Review it before sending.'}),acts:[{label:'Use draft',primary:true,run:async()=>{
     if(!live()||read()!==expected){confirm.now();fw.toast('Your draft changed. Review the copy again.');return}
     confirm.setBusy(true);freeze(true);try{const saved=await svc.call('draft',id,expected);if(!saved?.ok)throw Error('Keep the local draft before recovering.');const result=await svc.call('restoreDraftCopy',value.device,id,expected);if(live()&&read()===expected){apply(result.text);confirm.now();h.now();fw.toast('Draft recovered. Review before sending.')}}catch(_){if(live()){confirm.setBusy(false);fw.toast('Draft could not be restored. Your local draft is kept.')}}finally{freeze(false)}
    }}]});
   }})));
  }
 }catch(_){if(live()){status.textContent='Copies could not load. Unlock Chats and check your connection.';body.append(ui.btn('Remembered devices',{run:()=>{h.now();fw.nav.go('/#you=remembered')}}))}}
}
