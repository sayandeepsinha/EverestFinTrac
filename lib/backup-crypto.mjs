const backupIterations = 310000;
const encodeBytes = bytes => btoa(String.fromCharCode(...bytes));
const decodeBytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
async function backupKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations:backupIterations}, material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
export async function encryptBackup(data, password) {
  if (password.length < 12) throw new Error('Use a password of at least 12 characters.');
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await backupKey(password, salt);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(JSON.stringify(data)));
  // Encode in chunks to avoid spreading a large portfolio into one call.
  const bytes=new Uint8Array(ciphertext);let binary='';
  for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {format:'everest-encrypted-backup',version:1,kdf:'PBKDF2-SHA256',iterations:backupIterations,cipher:'AES-256-GCM',salt:encodeBytes(salt),iv:encodeBytes(iv),data:btoa(binary)};
}
export async function decryptBackup(envelope, password) {
  if (envelope?.format!=='everest-encrypted-backup'||envelope.version!==1||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==backupIterations||envelope.cipher!=='AES-256-GCM'||typeof envelope.salt!=='string'||typeof envelope.iv!=='string'||typeof envelope.data!=='string') throw new Error('Unsupported encrypted backup.');
  try {
    const salt=decodeBytes(envelope.salt),iv=decodeBytes(envelope.iv),ciphertext=decodeBytes(envelope.data);
    if(salt.length!==16||iv.length!==12||ciphertext.length<16) throw new Error();
    const key=await backupKey(password,salt);
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch { throw new Error('Could not unlock backup. Check the password and file.'); }
}
