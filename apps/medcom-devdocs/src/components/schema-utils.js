import catalog from '../data/catalog.json';
export const schemas = catalog.spec.components.schemas;
export function resolve(schema) {return schema?.$ref ? schemas[schema.$ref.split('/').pop()] || {} : schema || {};}
export function typeLabel(s={}) {
  if(s.$ref)return s.$ref.split('/').pop();
  if(s.anyOf||s.oneOf)return(s.anyOf||s.oneOf).map(typeLabel).join(' | ');
  if(s.allOf)return s.allOf.map(typeLabel).join(' & ');
  if(s.type==='array')return typeLabel(s.items)+'[]';
  return(Array.isArray(s.type)?s.type.join(' | '):s.type||'unknown')+(s.format?' · '+s.format:'');
}
export function isNullable(s){return s.nullable===true||s.type==='null'||Array.isArray(s.type)&&s.type.includes('null')||(s.anyOf||s.oneOf||[]).some(v=>v.type==='null');}
export function sample(schema,seen=new Set(),depth=0){
  if(!schema||depth>7)return null;
  if(schema.$ref){if(seen.has(schema.$ref))return null;seen=new Set(seen).add(schema.$ref);}
  const s=resolve(schema);
  if('const'in s)return s.const;
  if(s.enum)return s.enum[0];
  if(s.anyOf||s.oneOf)return sample((s.anyOf||s.oneOf).find(v=>v.type!=='null'),seen,depth+1);
  if(s.allOf)return Object.assign({},...s.allOf.map(v=>sample(v,seen,depth+1)));
  if(s.properties||s.type==='object')return Object.fromEntries(Object.entries(s.properties||{}).map(([k,v])=>[k,/password|token|secret/i.test(k)?'<redacted>':sample(v,seen,depth+1)]));
  if(s.type==='array')return s.minItems>0?[sample(s.items,seen,depth+1)]:[];
  if(s.type==='string')return s.format==='date'?'2026-10-17':s.format==='date-time'?'2026-10-17T09:00:00':'<string>';
  if(s.type==='integer'||s.type==='number')return s.minimum??0;
  if(s.type==='boolean')return false;
  return null;
}
