import React,{useState} from 'react';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import useBaseUrl from '@docusaurus/useBaseUrl';
import catalog from '../data/catalog.json';
import Schema from './Schema';
import {typeLabel,sample} from './schema-utils';
import {viDescription,viAdmission,constraintNames,parameterLocations} from '../lib/vietnamese.mjs';

export default function Operation({id}){
  const openapiUrl=useBaseUrl('/openapi.json');
  const op=catalog.operations.find(o=>o.operationId===id);
  const [status,setStatus]=useState(Object.keys(op?.responses||{})[0]);const[language,setLanguage]=useState('curl');
  if(!op)return <p>Chưa xác định được API.</p>;
  const body=Object.entries(op.requestBody?.content||{});
  const response=op.responses[status];
  const query=op.parameters.filter(p=>p.in==='query').map(p=>encodeURIComponent(p.name)+'='+encodeURIComponent(p.schema?.default??p.schema?.enum?.[0]??'{'+p.name+'}')).join('&');
  const url='https://api-medcom.bms79.com'+op.path+(query?'?'+query:'');
  const media=body[0];const payload=media?.[0]==='application/json'?JSON.stringify(sample(media[1].schema),null,2):null;
  const curl=['curl --request '+op.method,"  '"+url+"'","  --header 'Accept: application/json'",...(op.security?.some(s=>s.SessionCookie!==undefined)?["  --cookie '<session-cookie-managed-by-browser>'"]:[]),...op.parameters.filter(p=>p.in==='header').map(p=>"  --header '"+p.name+": <"+p.name+">'"),...(op.security?.some(s=>s.CsrfToken!==undefined)?["  --header 'X-CSRF-TOKEN: <csrf-token>'"]:[]),...(payload?["  --header 'Content-Type: application/json'","  --data-raw '"+payload.replaceAll("'", "'\\''")+"'"]:[])].join(' \\\n');
  const fetchCode=`// Ví dụ cấu trúc. Gọi qua lớp trung gian cùng nguồn đã cấu hình.\nconst response = await fetch(${JSON.stringify(op.path+(query?'?'+query:''))}, {\n  method: ${JSON.stringify(op.method)},\n  credentials: 'include',\n  headers: { Accept: 'application/json'${payload?", 'Content-Type': 'application/json'":''}${op.security?.some(s=>s.CsrfToken!==undefined)?", 'X-CSRF-TOKEN': csrfToken":''}${op.parameters.some(p=>p.name==='X-Medcom-Read-Scope')?", 'X-Medcom-Read-Scope': currentReadScope":''} },${payload?'\n  body: JSON.stringify('+payload+'),':''}\n});\n// Kiểm tra kiểu nội dung, mã HTTP, phạm vi phiên, cấu trúc và kết quả nghiệp vụ.\n// Yêu cầu multipart dùng FormData theo các trường được mô tả.`;
  const extendedSchemas=Object.entries(op).filter(([k,v])=>k.startsWith('x-')&&v&&typeof v==='object');
  return <div className="operation-doc">
    <div className="endpoint-bar"><span className={'method method-'+op.method.toLowerCase()}>{op.method}</span><code>{op.path}</code></div>
    <p className="operation-id">Mã thao tác <code>{op.operationId}</code>{op.tags?.map(tag=><span key={tag} className="type-chip">{tag}</span>)}</p>
    <nav className="operation-toc" aria-label="Nội dung API">{[['security','Xác thực và quyền'],['parameters','Tham số'],['request','Dữ liệu gửi'],['request-example','Ví dụ'],['responses','Kết quả'],['extensions','Mở rộng đặc tả'],['evidence','Nguồn tham chiếu']].map(([anchor,label])=><a key={anchor} href={'#'+anchor}>{label}</a>)}</nav>
    {op.uiPurpose?<div className="operation-purpose"><span className="eyebrow">{op.uiPlacement}</span><p>{op.uiPurpose}</p><small>Nguồn: {op.descriptionEvidence}</small></div>:<p>{viDescription(op.description)}</p>}
    <h2 id="security">Xác thực và phân quyền</h2>
    <div className="security-list">{op.security?.length?op.security.map((s,i)=><div key={i}>{Object.keys(s).map(k=><span key={k}><span>{({SessionCookie:'Phiên đăng nhập',CsrfCookie:'Cookie chống giả mạo',CsrfToken:'Mã chống giả mạo CSRF'})[k]||'Cơ chế xác thực'}: </span><code>{k}</code></span>)}</div>):<span>Không khai báo cơ chế xác thực riêng tại API này.</span>}</div>
    {op['x-medcom-capability']&&<p>Quyền đọc cần có: <code>{op['x-medcom-capability']}</code>. Quyền thực hiện từng thao tác ghi được kiểm tra riêng.</p>}
    <p>{viAdmission(op['x-medcom-admission'])}</p>
    <h2 id="parameters">Tham số</h2>
    {op.parameters.length?<div className="table-scroll"><table><thead><tr><th>Tên tham số</th><th>Vị trí</th><th>Bắt buộc</th><th>Kiểu và giới hạn</th></tr></thead><tbody>{op.parameters.map(p=><tr key={p.in+p.name}><td><code>{p.name}</code></td><td>{parameterLocations[p.in]||p.in}</td><td>{p.required?'Có':'Không'}</td><td><code>{typeLabel(p.schema)}</code><div className="constraint-text">{Object.entries(p.schema||{}).filter(([k])=>!['type','$ref','description'].includes(k)).map(([k,v])=>(constraintNames[k]||k)+': '+JSON.stringify(v)).join(' · ')}</div>{viDescription(p.description)}</td></tr>)}</tbody></table></div>:<p>Không khai báo tham số riêng. Các kiểm tra chung của máy chủ vẫn áp dụng.</p>}
    <h2 id="request">Dữ liệu gửi lên</h2>
    {body.length?body.map(([mime,content])=><div key={mime}><div className="schema-caption"><code>{mime}</code><span>{op.requestBody.required?'Bắt buộc có phần thân yêu cầu':'Phần thân yêu cầu không bắt buộc'}</span></div><Schema schema={content.schema}/></div>):<p>Không khai báo phần thân yêu cầu.</p>}
    <h2 id="request-example">Ví dụ gọi API</h2>
    <p className="example-warning">Ví dụ được sinh theo cấu trúc dữ liệu, chưa được thực thi. Cần thay các giá trị minh họa và kiểm tra ràng buộc trước khi gửi. Không dùng nguyên mẫu để ghi lên môi trường thật.</p>
    <div className="segmented" role="group" aria-label="Ngôn ngữ ví dụ request">{['curl','fetch'].map(l=><button key={l} type="button" aria-pressed={l===language} onClick={()=>setLanguage(l)}>{l==='fetch'?'TypeScript fetch':'cURL'}</button>)}</div>
    <CodeBlock language={language==='curl'?'bash':'typescript'}>{language==='curl'?curl:fetchCode}</CodeBlock>
    {media&&media[0]!=='application/json'&&<p>Ví dụ không tạo sẵn tệp multipart. Dùng đúng trường và kiểu nội dung ở trên; xem thêm tài liệu ảnh đính kèm.</p>}
    <h2 id="responses">Kết quả trả về</h2>
    <div className="segmented response-tabs" role="group" aria-label="Mã phản hồi">{Object.keys(op.responses).map(s=><button key={s} type="button" aria-pressed={status===s} onClick={()=>setStatus(s)}>{s==='default'?'Lỗi khác (default)':s}</button>)}</div>
    <p>{viDescription(response.description)}</p>
    {Object.entries(response.headers||{}).length>0&&<details className="response-headers"><summary>Header của phản hồi</summary><dl>{Object.entries(response.headers).map(([k,v])=><React.Fragment key={k}><dt><code>{k}</code></dt><dd>{viDescription(v.description)}</dd></React.Fragment>)}</dl></details>}
    {Object.entries(response.content||{}).map(([mime,content])=><div key={status+mime}><div className="schema-caption"><code>{mime}</code></div><Schema schema={content.schema}/><details className="json-example"><summary>Ví dụ JSON theo cấu trúc dữ liệu</summary><CodeBlock language="json">{JSON.stringify(sample(content.schema),null,2)}</CodeBlock></details></div>)}
    {!response.content&&<p>Phản hồi không khai báo phần nội dung.</p>}
    <h2 id="extensions">Thông tin mở rộng của đặc tả</h2>
    <details className="response-headers"><summary>Giá trị gốc trong OpenAPI</summary><CodeBlock language="json">{JSON.stringify(Object.fromEntries(Object.entries(op).filter(([k])=>k.startsWith('x-'))),null,2)}</CodeBlock></details>
    {extendedSchemas.map(([key,value])=><details key={key} className="response-headers"><summary>{key}</summary>{value.$ref?<Schema schema={value}/>:Object.entries(value).filter(([,v])=>v?.$ref).map(([section,s])=><div key={section}><h3>{section}</h3><Schema schema={s}/></div>)}</details>)}
    <h2 id="evidence">Nguồn tham chiếu</h2>
    <p className="hash">OpenAPI SHA-256: {catalog.provenance.sha256}</p>
    <p><code>{'#/paths/'+op.path.replaceAll('~','~0').replaceAll('/','~1')+'/'+op.method.toLowerCase()}</code></p>
    <p><a href={openapiUrl} download>Tải đặc tả gốc</a> · <Link to="/docs/foundation/errors">Lỗi và cách xử lý</Link> · <Link to="/docs/foundation/auth">Xác thực và phạm vi phiên</Link></p>
  </div>;
}
