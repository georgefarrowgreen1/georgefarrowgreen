// Check the running engine, rather than only the gateway deployment metadata.
export async function profileFingerprint(text){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));return [...bytes].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,12);}
export const engineMatches=(health,date,profile)=>health?.ready===true&&typeof health.snapshot==='string'&&health.snapshot.startsWith(date+'-')&&health.snapshot.endsWith('-'+profile);
