// Review-only file handoff; crypto and actual sends remain in the Chat core.
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const words=v=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,140):'';
export async function attachFromFiles(ctx,objectId,{current}={}){const {fw,svc,store}=ctx,api=fw.workspace,permitted=current,active=current;
      if(!/^drop:[a-f0-9]{32}$/.test(objectId||''))return {ok:false};
      const selected=await api.files.fromDrop({getData:type=>type==='application/x-inflite-files-token'?objectId.slice(5):''},{maxBytes:8*1024*1024,maxFiles:1,current:permitted});if(!permitted()||!active()||!selected?.length)return {ok:false};
      const file=selected[0],el=fw.ui.el,list=el('div',{class:'chs'}),candidates=[...(store.get('friends')||[]),...(store.get('groups')||[]),...(store.get('rows')||[])],seen=new Set();let picker;
      list.append(el('p',{text:file.name+' · '+Math.ceil(file.size/1024)+' KB. Choose a conversation. Nothing is sent yet.'}));
      for(const p of candidates){if(!ID.test(p.id||'')||p.blocked||seen.has(p.id))continue;seen.add(p.id);list.append(fw.ui.btn(words(p.name)||'Conversation',{run:()=>{if(!permitted()||picker.closed)return;let confirm;confirm=fw.sheet.open({sheet:'chat-file-confirm',title:'Send attachment?',body:el('div',{class:'chs'},el('h3',{text:file.name}),el('p',{text:'Send a copy to '+(words(p.name)||'this conversation')+'? The original stays in Files. Attachments use Chat encryption.'})),acts:[{label:'Send to '+(words(p.name)||'conversation'),primary:true,run:async()=>{if(!permitted()||picker.closed||confirm.closed||!active())return;confirm.setBusy(true);try{await svc.call('sendBlob',p.id,file,'file');if(permitted()){confirm.now();picker.now();fw.toast('Attachment queued in Chats.')}}catch(_){if(permitted()&&!confirm.closed){confirm.setBusy(false);fw.toast('The attachment could not be sent. Your original is still in Files.')}}}}]})}}))}
      if(!seen.size)list.append(el('p',{text:'Add a friend in Chats before sharing a file.'}));picker=fw.sheet.open({sheet:'chat-file-recipient',title:'Attach in Chats',body:list});return {ok:true,pending:true};
}
