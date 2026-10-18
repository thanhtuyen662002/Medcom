import React from 'react';
import {resolve,typeLabel,isNullable} from './schema-utils';
import {viDescription,constraintNames} from '../lib/vietnamese.mjs';

export default function Schema({schema={},depth=0,seen=[],name='root'}){
  const s=resolve(schema);const ref=schema.$ref;
  if(ref&&seen.includes(ref))return <p className="schema-recursive">Tham chiếu lặp: <code>{typeLabel(schema)}</code>. Xem cấu trúc gốc trong OpenAPI.</p>;
  if(depth>10)return <p>Xem đầy đủ cấu trúc trong OpenAPI.</p>;
  const next=ref?[...seen,ref]:seen;
  const variants=s.anyOf||s.oneOf||s.allOf;
  return <div className="schema-tree">
    {ref&&<div className="schema-ref"><span>CẤU TRÚC</span><code>{ref.split('/').pop()}</code></div>}
    {s.description&&<p>{viDescription(s.description)}</p>}
    {variants&&<div className="schema-variants"><span className="type-chip">{s.anyOf?'anyOf':s.oneOf?'oneOf':'allOf'}</span>{variants.map((v,i)=><Schema key={i} schema={v} depth={depth+1} seen={next} name={name}/>)}</div>}
    {s.properties?<div className="schema-properties">{Object.entries(s.properties).map(([key,value])=>{
      const resolved=resolve(value);const children=resolved.properties||resolved.items||resolved.anyOf||resolved.oneOf||resolved.allOf||typeof resolved.additionalProperties==='object';
      const constraints=Object.entries(resolved).filter(([k])=>['format','enum','const','default','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','pattern','minItems','maxItems','uniqueItems','readOnly','writeOnly'].includes(k));
      const field=<><div className="field-heading"><code className="field-key">{key}</code><span className="field-type">{typeLabel(value)}</span>{(s.required||[]).includes(key)&&<span className="required-chip">Bắt buộc</span>}{isNullable(value)&&<span className="type-chip">Cho phép null</span>}</div>
        {resolved.description&&<p className="field-description">{viDescription(resolved.description)}</p>}
        {value['x-medcom-source-column']&&<div className="db-binding"><span>CỘT SQL</span><code>{value['x-medcom-source-column']}</code><code>{value['x-medcom-sql-type']}{value['x-medcom-sql-type-arguments']}</code>{'x-medcom-writable'in value&&<span>{value['x-medcom-writable']?'Có ánh xạ ghi':'Chỉ đọc theo ánh xạ'}</span>}</div>}
        {constraints.length>0&&<div className="field-constraints">{constraints.map(([k,v])=><span key={k}>{constraintNames[k]||k}: <code>{JSON.stringify(v)}</code></span>)}</div>}</>;
      return children?<details className="schema-field" key={key} open={depth<1}><summary>{field}</summary><div className="schema-nested"><Schema schema={value} depth={depth+1} seen={next} name={name+'.'+key}/></div></details>:<div className="schema-field" key={key}>{field}</div>;
    })}</div>:!variants&&!s.items&&<p className="schema-primitive"><code>{typeLabel(s)}</code>{s.enum&&' · '+JSON.stringify(s.enum)}</p>}
    {s.items&&<div className="schema-array"><span className="eyebrow">PHẦN TỬ TRONG MẢNG</span><Schema schema={s.items} depth={depth+1} seen={next} name={name+'[]'}/></div>}
    {'additionalProperties'in s&&<div className="additional-properties">Trường bổ sung ngoài khai báo: <strong>{s.additionalProperties===false?'Không cho phép':s.additionalProperties===true?'Cho phép':'Theo cấu trúc bên dưới'}</strong>{typeof s.additionalProperties==='object'&&<Schema schema={s.additionalProperties} depth={depth+1} seen={next}/>}</div>}
  </div>;
}
