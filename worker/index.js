const page = __PAGE__;
const scriptHash = __SCRIPT_HASH__;
const cache = new Map();
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function upstream(url, options={}) { const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)}); if(!r.ok) throw Error('Data provider unavailable ('+r.status+')'); return r; }
async function nse(symbol) {
  const url='https://mcp.nseindia.in/cmmkt/mcp';
  const headers={'content-type':'application/json','accept':'application/json, text/event-stream'};
  const init=await upstream(url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'Northstar personal tracker',version:'1.0'}}})});
  const session=init.headers.get('mcp-session-id');if(!session)throw Error('NSE session unavailable');
  const res=await upstream(url,{method:'POST',headers:{...headers,'mcp-session-id':session},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'cm_get_stock_quote',arguments:{symbol}}})});
  const text=await res.text();const payload=text.startsWith('event:')?text.split('\n').find(l=>l.startsWith('data:'))?.slice(5):text;
  const rpc=JSON.parse(payload);if(rpc.result?.isError||!rpc.result?.content?.[0]?.text)throw Error('NSE quote unavailable');
  const result=JSON.parse(rpc.result.content[0].text),stock=result.stock;
  if(!stock||!Number.isFinite(stock.lastTradedPrice)||stock.lastTradedPrice<=0)throw Error('Symbol not found on NSE');
  return {name:stock.symbol,price:stock.lastTradedPrice,previous:stock.preClosePrice||null,asOf:stock.latestTimestamp||result.updatedAt,source:'NSE',kind:'stock'};
}
const yahooHeaders={'user-agent':'Mozilla/5.0'};
async function yahooSearch(query){const url='https://query1.finance.yahoo.com/v1/finance/search?q='+encodeURIComponent(query)+'&quotesCount=25&newsCount=0';return (await (await upstream(url,{headers:yahooHeaders})).json()).quotes||[]}
async function stockSearch(query,exchange) {
 const quotes=await yahooSearch(query),suffix=exchange==='bse'?'.BO':'.NS',market=exchange==='bse'?'BSE':'NSI',seen=new Set();
 let matches=quotes.filter(x=>x.exchange===market&&x.quoteType==='EQUITY'&&/^[A-Z0-9&-]+\.(NS|BO)$/.test(x.symbol));
 // Yahoo often omits a BSE listing for a short company search. Verify related NSE symbols individually.
 if(exchange==='bse'&&matches.length<5){const candidates=quotes.filter(x=>x.exchange==='NSI'&&x.quoteType==='EQUITY'&&/^[A-Z0-9&-]+\.NS$/.test(x.symbol)).slice(0,5);const found=await Promise.all(candidates.map(async x=>{try{const list=await yahooSearch(x.symbol.slice(0,-3)+'.BO');return list.find(y=>y.exchange==='BSE'&&y.symbol===x.symbol.slice(0,-3)+'.BO'&&y.quoteType==='EQUITY')}catch{return null}}));matches=matches.concat(found.filter(Boolean))}
 return matches.filter(x=>x.symbol.endsWith(suffix)&&!seen.has(x.symbol)&&seen.add(x.symbol)).slice(0,12).map(x=>({symbol:x.symbol.slice(0,-3),name:x.longname||x.shortname||x.symbol.slice(0,-3)}));
}
let catalogue=null,catalogueTime=0,cataloguePromise=null;
async function fundSearch(query){
 if(query.length<3){const list=await(await upstream('https://api.mfapi.in/mf/search?q='+encodeURIComponent(query))).json();return Array.isArray(list)?list.slice(0,12).map(x=>({symbol:String(x.schemeCode),name:x.schemeName})):[]}
 if(!catalogue||Date.now()-catalogueTime>12*3600000){if(!cataloguePromise)cataloguePromise=(async()=>{const list=await(await upstream('https://api.mfapi.in/mf')).json();if(!Array.isArray(list))throw Error('Fund list unavailable');catalogue=list.filter(x=>typeof x.schemeName==='string'&&x.schemeCode).map(x=>({symbol:String(x.schemeCode),name:x.schemeName,lower:x.schemeName.toLowerCase()}));catalogueTime=Date.now()})().finally(()=>{cataloguePromise=null});await cataloguePromise}
 const words=query.toLowerCase().split(/\s+/).filter(Boolean);return catalogue.filter(x=>words.every(w=>x.lower.includes(w))).map(x=>({x,rank:(x.lower.startsWith(words[0])?0:10)+(x.lower.includes('direct')?0:2)+(x.lower.includes('growth')?0:1)})).sort((a,b)=>a.rank-b.rank||a.x.name.localeCompare(b.x.name)).slice(0,12).map(({x})=>({symbol:x.symbol,name:x.name}));
}
async function bse(symbol){const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol+'.BO')+'?range=5d&interval=1d',data=await(await upstream(url,{headers:yahooHeaders})).json(),m=data.chart?.result?.[0]?.meta;if(!m||m.currency!=='INR'||m.exchangeName!=='BSE'||!(m.regularMarketPrice>0))throw Error('BSE quote unavailable');const previous=Number.isFinite(m.fulldayChange)?m.regularMarketPrice-m.fulldayChange:null;return {name:m.longName||m.shortName||symbol,price:m.regularMarketPrice,previous:previous>0?previous:null,asOf:m.regularMarketTime?new Date(m.regularMarketTime*1000).toISOString():null,source:'Yahoo Finance / BSE',kind:'stock'};}
async function fund(code) {
  const now=new Date(),end=now.toISOString().slice(0,10),start=new Date(now.getTime()-45*86400000).toISOString().slice(0,10);
  let data=await (await upstream(`https://api.mfapi.in/mf/${code}?startDate=${start}&endDate=${end}`)).json();
  if(!data.data?.length)data=await (await upstream(`https://api.mfapi.in/mf/${code}/latest`)).json();
  const entries=(data.data||[]).filter(x=>Number(x.nav)>0);if(!entries.length)throw Error('Mutual fund NAV unavailable');
  return {name:data.meta?.scheme_name||code,price:Number(entries[0].nav),previous:entries[1]?Number(entries[1].nav):null,asOf:entries[0].date,source:'MFapi / AMFI',kind:'fund'};
}
export default {async fetch(request){
 const u=new URL(request.url);if(u.pathname==='/')return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'sha256-"+scriptHash+"'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'",'referrer-policy':'no-referrer','x-content-type-options':'nosniff','permissions-policy':'camera=(), microphone=(), geolocation=()'}});
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 if(u.pathname==='/api/search'){const q=(u.searchParams.get('q')||'').trim(),kind=u.searchParams.get('kind');if(q.length<2||q.length>80||!['stock','bse','fund'].includes(kind))return reply({error:'Enter at least 2 characters'},400);try{const cacheKey='search:'+kind+':'+q.toLowerCase(),hit=cache.get(cacheKey);if(hit&&Date.now()-hit.time<600000)return reply(hit.data);let results;if(kind==='stock'||kind==='bse')results=await stockSearch(q,kind);else results=await fundSearch(q);cache.set(cacheKey,{data:results,time:Date.now()});if(cache.size>500)cache.delete(cache.keys().next().value);return reply(results)}catch{return reply({error:'Search temporarily unavailable'},502)}}
 if(u.pathname==='/api/quote'){const kind=u.searchParams.get('kind'),symbol=(u.searchParams.get('symbol')||'').toUpperCase();if(!((['stock','bse'].includes(kind)&&/^[A-Z0-9&-]{1,20}$/.test(symbol))||(kind==='fund'&&/^\d{5,8}$/.test(symbol))))return reply({error:'Invalid symbol or scheme code'},400);
 const key=kind+':'+symbol,cached=cache.get(key),ttl=kind==='fund'?3600000:60000;if(cached&&Date.now()-cached.time<ttl)return reply(cached.data);
 try{const data=kind==='stock'?await nse(symbol):kind==='bse'?await bse(symbol):await fund(symbol);cache.set(key,{data,time:Date.now()});if(cache.size>500)cache.delete(cache.keys().next().value);return reply(data)}catch(e){return reply({error:e.message||'Quote unavailable'},502)}}
 return new Response('Not found',{status:404});
}};
