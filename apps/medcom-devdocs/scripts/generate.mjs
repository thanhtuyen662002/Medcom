import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {viDescription,viAdmission} from '../src/lib/vietnamese.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
export const spec = JSON.parse(await fs.readFile(path.join(root, 'contracts/openapi.json'), 'utf8'));
const provenance = JSON.parse(await fs.readFile(path.join(root, 'contracts/provenance.json'), 'utf8'));
const referencePath = 'docs/backend/BE_FE_API_REFERENCE_20261011.md';
const referenceText = await fs.readFile(path.join(repo, referencePath), 'utf8');
const operationPurposes = new Map();
for (const [lineIndex, line] of referenceText.split(/\r?\n/).entries()) {
  const cells = line.split('|').map(v=>v.trim());
  const match = cells[2]?.match(/^`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`$/);
  if (match) operationPurposes.set(match[1]+' '+match[2],{uiPlacement:cells[1],uiPurpose:cells[3],descriptionEvidence:referencePath+':'+(lineIndex+1)});
}
const helpSource = await fs.readFile(path.join(repo, 'apps/medcom-sites/lib/help/guides.ts'), 'utf8');
const groupsLiteral = helpSource.match(/export const helpGroups[^=]*=\s*([\s\S]*?);\s*export function groupGuideIds/)[1];
const helpGroups = JSON.parse(JSON.stringify(vm.runInNewContext('(' + groupsLiteral + ')', {}, {timeout: 1000})));
const titles = Object.fromEntries([...helpSource.matchAll(/id: "([\w-]+)", title: "([^"]+)"/g)].map(m => [m[1], m[2]]));
for (const match of helpSource.matchAll(/\["([\w-]+)", "([^"]+)"\]/g)) titles[match[1]] = match[2];
const sources = ['inventories/erp/20261010/six-screen-catalog.json', 'inventories/erp/20261011/cud-workflow-catalog.json'];
const screens = [];
const sourceHashes = [];
sourceHashes.push({path: referencePath, sha256: crypto.createHash('sha256').update(referenceText).digest('hex')});
for (const source of sources) {
  const bytes = await fs.readFile(path.join(repo, source));
  sourceHashes.push({path: source, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
  for (const screen of JSON.parse(bytes).screens) screens.push({...screen, source});
}
const screenById = Object.fromEntries(screens.map(s => [s.id, s]));
export const operations = Object.entries(spec.paths).flatMap(([url, item]) => Object.entries(item)
  .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method))
  .map(([method, op]) => ({...op, ...operationPurposes.get(method.toUpperCase()+' '+url), method: method.toUpperCase(), path: url,
    parameters: [...(item.parameters || []), ...(op.parameters || [])],
    module: url.match(/^\/api\/erp\/([^/]+)/)?.[1] || null,
    slug: op.operationId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()})));
const safe = s => String(s ?? 'UNKNOWN').replaceAll('|', '\\|').replaceAll('\n', ' ');
const code = s => '`' + safe(s).replaceAll('`', '') + '`';
const doc = async (id, title, content) => {
  const dest = path.join(root, 'docs', id + '.mdx');
  await fs.mkdir(path.dirname(dest), {recursive: true});
  await fs.writeFile(dest, `---\ntitle: ${JSON.stringify(title)}\n---\n\n${content}\n`);
};
const linkOperation = op => `/docs/api/${op.slug}`;
export function typeName(schema = {}) {
  if (schema.$ref) return schema.$ref.split('/').pop();
  if (schema.anyOf || schema.oneOf) return (schema.anyOf || schema.oneOf).map(typeName).join(' | ');
  if (schema.allOf) return schema.allOf.map(typeName).join(' & ');
  if (schema.type === 'array') return typeName(schema.items) + '[]';
  if (schema.type === 'object' && !schema.properties && schema.additionalProperties) return 'Record<string, ' + typeName(schema.additionalProperties === true ? {} : schema.additionalProperties) + '>';
  return (Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type || 'unknown') + (schema.format ? ` (${schema.format})` : '');
}
function deref(s) { return s?.$ref ? spec.components.schemas[s.$ref.split('/').pop()] : s; }
export function flatten(schema, prefix = '', seen = new Set(), depth = 0) {
  if (!schema || depth > 12) return [];
  const ref = schema.$ref;
  if (ref && seen.has(ref)) return [{field: prefix || '$', type: ref.split('/').pop(), description: 'Recursive reference; inspect OpenAPI.'}];
  const next = new Set(seen); if (ref) next.add(ref);
  const s = deref(schema); if (!s) return [];
  if (s.anyOf || s.oneOf || s.allOf) return (s.anyOf || s.oneOf || s.allOf).flatMap(v => flatten(v, prefix, next, depth + 1));
  const rows = [];
  for (const [name, field] of Object.entries(s.properties || {})) {
    const resolved = deref(field) || {};
    const fieldPath = prefix ? prefix + '.' + name : name;
    rows.push({field: fieldPath, type: typeName(field), required: (s.required || []).includes(name), nullable: field.nullable === true || field.type === 'null' || (field.anyOf || field.oneOf || []).some(v => v.type === 'null'),
      column: field['x-medcom-source-column'], sqlType: field['x-medcom-sql-type'], sqlArgs: field['x-medcom-sql-type-arguments'], writable: field['x-medcom-writable'],
      description: resolved.description || field.description || '', constraints: Object.fromEntries(Object.entries(field).filter(([k]) => ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'enum', 'format', 'default', 'minItems', 'maxItems', 'readOnly', 'writeOnly', 'const'].includes(k)))});
    rows.push(...flatten(field, fieldPath, next, depth + 1));
  }
  if (s.items) rows.push(...flatten(s.items, prefix + '[]', next, depth + 1));
  if (s.additionalProperties && typeof s.additionalProperties === 'object') rows.push(...flatten(s.additionalProperties, prefix + '.*', next, depth + 1));
  return rows;
}
export function example(schema, seen = new Set(), depth = 0) {
  if (!schema || depth > 7) return null;
  if (schema.$ref) { if (seen.has(schema.$ref)) return null; seen = new Set(seen).add(schema.$ref); }
  const s = deref(schema) || {};
  if ('const' in s) return s.const;
  if (s.enum) return s.enum[0];
  if (s.anyOf || s.oneOf) return example((s.anyOf || s.oneOf).find(v => v.type !== 'null') || {type: 'null'}, seen, depth + 1);
  if (s.allOf) return Object.assign({}, ...s.allOf.map(v => example(v, seen, depth + 1)));
  if (s.type === 'object' || s.properties) return Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, /password|token|secret/i.test(k) ? '<redacted>' : example(v, seen, depth + 1)]));
  if (s.type === 'array') return s.minItems > 0 ? Array.from({length: Math.min(s.minItems, 3)}, () => example(s.items, seen, depth + 1)) : [];
  if (s.type === 'boolean') return false;
  if (s.type === 'integer' || s.type === 'number') return s.minimum ?? 0;
  if (s.type === 'null') return null;
  if (s.type === 'string') return s.format === 'date' ? '2026-10-17' : s.format === 'date-time' ? '2026-10-17T09:00:00' : '<string>';
  return null;
}
const table = rows => '| Đường dẫn trường | Kiểu JSON | Bắt buộc | Cho phép null | Cột SQL | Kiểu SQL | Ánh xạ ghi | Giới hạn / mô tả |\n|---|---|---|---|---|---|---|---|\n' + rows.map(r => `| ${code(r.field)} | ${code(r.type)} | ${r.required ? 'Có' : 'Không'} | ${r.nullable ? 'Có' : 'Không'} | ${r.column ? code(r.column) : '—'} | ${r.sqlType ? code(r.sqlType + (r.sqlArgs || '')) : '—'} | ${r.writable === undefined ? '—' : r.writable ? 'Có' : 'Không'} | ${safe([viDescription(r.description), Object.keys(r.constraints || {}).length ? JSON.stringify(r.constraints) : ''].filter(Boolean).join(' · '))} |`).join('\n');
const operationsTable = ops => '| Phương thức | Đường dẫn | Chức năng | Mã thao tác |\n|---|---|---|---|\n' + ops.map(op => `| ${code(op.method)} | ${code(op.path)} | ${safe(op.uiPurpose || 'UNKNOWN; xem contract')} | [${op.operationId}](${linkOperation(op)}) |`).join('\n');
const sourceNote = source => `**Nguồn tham chiếu:** ${code(source)}. Đây là bản mô tả kỹ thuật được lưu từ nguồn; cần đối chiếu môi trường triển khai khi tích hợp. Thuộc tính writable không thay thế quyền ghi của tài khoản.`;
const searchIndex = [];
const agentChunks = [];
const moduleIndex = [];

for (const op of operations) {
  const parameterText = op.parameters.length ? '| Tên | Vị trí | Bắt buộc | Kiểu / giới hạn |\n|---|---|---|---|\n' + op.parameters.map(p => `| ${code(p.name)} | ${p.in} | ${p.required ? 'Có' : 'Không'} | ${code(typeName(p.schema))} ${safe(JSON.stringify(p.schema || {}))} |`).join('\n') : 'Không khai báo parameter tường minh trong OpenAPI. Các guard chung vẫn áp dụng theo loại thao tác.';
  let markdown = `# ${op.method} ${op.path}\n\nOperation ID: ${code(op.operationId)}\n\n${op.uiPurpose||''}\n\n${op.descriptionEvidence||''}\n\n${viDescription(op.description)}\n\n## Tham số\n\n${parameterText}\n\n`;
  const bodies = Object.entries(op.requestBody?.content || {});
  for (const [mime, media] of bodies) markdown += `## Request ${mime}\n\n${table(flatten(media.schema))}\n\nVí dụ tổng hợp từ schema; không phải payload đã được chấp nhận. Thay placeholder, kiểm tra toàn bộ ràng buộc trước khi gửi.\n\n\`\`\`json\n${JSON.stringify(example(media.schema), null, 2)}\n\`\`\`\n\n`;
  for (const [status, response] of Object.entries(op.responses || {})) {
    markdown += `## Kết quả ${status}\n\n${viDescription(response.description)}\n\n`;
    for (const [mime, media] of Object.entries(response.content || {})) markdown += `${code(mime)}\n\n${table(flatten(media.schema))}\n\n`;
    if (response.headers) markdown += 'Header phản hồi: ' + Object.entries(response.headers).map(([k,v]) => code(k) + ': ' + viDescription(v.description)).join('; ') + '\n\n';
  }
  markdown += `## Xác thực và phân quyền\n\n${JSON.stringify(op.security || [])}\n\n${viAdmission(op['x-medcom-admission'])}\n\n${Object.entries(op).filter(([k])=>k.startsWith('x-')).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n\n')}\n\nNguồn: contracts/openapi.json#/paths/${op.path.replaceAll('~','~0').replaceAll('/','~1')}/${op.method.toLowerCase()}\n`;
  agentChunks.push(markdown);
  await doc('api/' + op.slug, `${op.method} ${op.path}`, `import Operation from '@site/src/components/Operation';\n\n<Operation id=${JSON.stringify(op.operationId)} />`);
  searchIndex.push({title: op.method + ' ' + op.path, url: linkOperation(op), kind: 'API', text: [op.operationId, ...op.parameters.map(p => p.name), ...bodies.flatMap(([,m])=>flatten(m.schema).map(r=>r.field))].join(' ')});
}

for (const group of helpGroups) {
  const ids = [...group.guides, ...(group.sections || []).flatMap(s=>s.guides)];
  for (const id of ids) {
    const title = titles[id] || id;
    const ops = operations.filter(op => op.module === id);
    const screen = screenById[id];
    const exists = ops.length > 0;
    moduleIndex.push({id, title, sourceCaption:screen?.caption || null, group: group.title, available: exists, operations: ops.map(op=>op.operationId), fields: screen ? Object.values(screen.fields).reduce((n,v)=>n+v.length,0) : 0});
    let body = `Mục lục lấy từ thanh điều hướng ${code('/help')}; Các API dưới đây được đối chiếu bằng đúng mã phân hệ.\n\n`;
    if (!exists) {
      body += `:::info Chưa có API · Chưa xác minh (UNKNOWN)\n\nChưa có route module ${code('/api/erp/' + id)} trong bản OpenAPI được lưu. Chưa xác nhận được trường dữ liệu, yêu cầu/kết quả hoặc quy trình tương ứng. Không tự gán sang API có tên tương tự.\n\n:::\n\n## Việc cần xác nhận\n\nCần xác nhận mã phân hệ, đường dẫn, quyền, trường dữ liệu và quy trình nghiệp vụ trước khi tích hợp. Xem trang Tra cứu API để biết các API hiện có.\n`;
    } else {
      body += `Có **${ops.length} API** trong đặc tả. Trạng thái triển khai giao diện và nghiệm thu môi trường thật được xác nhận riêng.\n\n`;
      body += `## Trình tự tích hợp\n\n1. Kiểm tra phiên đăng nhập, không gian làm việc và quyền tại ${code('/api/erp/permissions')}.\n2. Lấy ${code('/api/erp/' + id + '/screen')} để tra cấu trúc trường, danh sách lựa chọn và thao tác.\n3. Tải danh sách theo chi nhánh; mở chi tiết bằng mã định danh theo đúng tham số API.\n4. Đọc trạng thái các nút trên chứng từ; tải tiếp các phần dữ liệu có ${code('hasMore')}.\n5. Trước khi ghi, kiểm tra lại quyền, phạm vi phiên và phiên bản chứng từ; dùng đúng cấu trúc yêu cầu và khóa chống ghi lặp.\n6. Khi chưa nhận được kết quả sau gửi, tra cứu lại chính yêu cầu đã gửi; không tạo yêu cầu ghi mới để thử lại.\n\n`;
      if (screen) body += `## Mô hình dữ liệu\n\nMenu ${code(screen.menuId)} · Form ${code(screen.formId)}. Tên trong danh mục nguồn: **${safe(screen.caption)}**. [Trường dữ liệu, danh sách lựa chọn và ánh xạ SQL](./${id}-fields).\n\nTên mục giữ nguyên theo hướng dẫn sử dụng. Việc đối chiếu dựa trên mã phân hệ; cần xác nhận nếu các tên menu khác nhau có thể mang ý nghĩa nghiệp vụ khác nhau.\n\n`;
      if (id==='sales-qr') body += `:::note Cần xác nhận nhãn nghiệp vụ\n\nHelp đặt tên “Xuất hàng theo PXK”, trong khi catalog/API reference mô tả QR xuất bán hàng. Route ${code('/api/erp/sales-qr')} được xác nhận; sự tương đương chính xác với menu PXK của owner là **UNKNOWN**. Không tự chuyển API này sang mục “Xuất bán hàng” ở nhóm Quét QR-Code khi chưa có xác nhận.\n\n:::\n\n`;
      body += `## API của màn hình\n\n${operationsTable(ops)}\n\n## Điều kiện triển khai\n\nĐọc [Xác thực và phạm vi phiên](/docs/foundation/auth), [Lỗi và cách xử lý](/docs/foundation/errors) và [Quy tắc xây dựng giao diện](/docs/foundation/ui). Máy chủ quyết định thao tác được phép ở thời điểm thực hiện. Thuộc tính writable không thay thế canCreate/canUpdate hoặc action.enabled.\n\n`;
      if (screen) body += sourceNote(screen.source + '#screens/' + id);
    }
    await doc('modules/' + id, title, body);
    searchIndex.push({title, url:'/docs/modules/'+id, kind:group.title, text: exists ? ops.map(o=>o.path).join(' ') : 'Feature UNKNOWN'});
    if (screen && exists) {
      let fields = `:::note Phạm vi nguồn\n\nCác trường lấy từ danh mục kỹ thuật được backend nhúng. API đang triển khai trả **401** khi chưa đăng nhập; chưa đối chiếu dữ liệu mô tả theo phiên trên môi trường thật. Đây không phải danh mục toàn bộ cột của cơ sở dữ liệu.\n\n:::\n\n`;
      fields += `## Bảng và định danh\n\n| Phần dữ liệu | Bảng SQL |\n|---|---|\n`;
      const tables = screen.tables || {header:screen.headerTable, lines:screen.lineTable, history:screen.historyTable, comparison:screen.comparisonTable};
      fields += Object.entries(tables).filter(([,v])=>v).map(([k,v])=>`| ${code(k)} | ${code(v)} |`).join('\n')+'\n\n';
      fields += 'Tên trong danh mục là tên trường nguồn. Kết quả phiên bản 3 có thể dùng tên thống nhất khác; phải đối chiếu cấu trúc phản hồi của từng API trước khi đọc hoặc gửi dữ liệu. Không gửi tên hiển thị thay mã định danh.\n\n';
      for (const [section, entries] of Object.entries(screen.fields)) {
        fields += `## Phần dữ liệu: ${section}\n\n| Trường nguồn | Cột SQL | Kiểu SQL | Cho phép null | Ánh xạ ghi | Mặc định | Trường ảo / nguồn |\n|---|---|---|---|---|---|---|\n`;
        fields += entries.map(f=>`| ${code(f.name)} | ${code(f.column)} | ${code(f.type+(f.typeArguments||''))} | ${f.nullable?'Có':'Không'} | ${f.writable?'Có':'Không'} | ${f.hasDefault?'Có; chưa xác minh giá trị (UNKNOWN)':'Không khai báo'} | ${f.virtual?'Trường ảo':'—'} ${f.sourceColumn?code(f.sourceColumn):''} |`).join('\n')+'\n\n';
      }
      fields += '## Danh sách lựa chọn\n\nKhông tự suy đoán cách tách chuỗi trường liên kết hoặc tham số. Đối chiếu đặc tả danh sách lựa chọn, dữ liệu mô tả từ máy chủ và mã xử lý hiện có.\n\n| Mã lựa chọn / trường | Bảng hiển thị | Trường giá trị | Trường tên | Trường liên kết | Tham số / bắt buộc | Vô hiệu / chọn nhiều |\n|---|---|---|---|---|---|---|\n';
      fields += screen.lookups.map(l=>`| ${code(l.id || l.ColumnID)} | ${code(l.GridName || 'header')} | ${code(l.ValueColumn)} | ${code(l.DisplayColumn)} | ${code(l.LinkColumn || '—')} | ${code(l.ParaArr || '—')} / ${code(l.ParaRequireArr || '—')} | ${Boolean(l.IsDisable)} / ${Boolean(l.IsMultiSelect)} |`).join('\n')+'\n\n';
      fields += '## Các thao tác\n\nTên và mã thao tác lấy theo danh mục, không thay thế quyền được cấp. Chỉ cho phép thực hiện khi cả quyền tài khoản và trạng thái nút trên chứng từ đều phù hợp.\n\n| Tên thao tác nguồn | Điều khiển | Mã thao tác khai báo | Nguồn tham chiếu |\n|---|---|---|---|\n';
      fields += screen.buttons.map(b=>`| ${safe(b.caption)} | ${code(b.control)} | ${code(b.operation || 'UNKNOWN; xem ErpScreenCatalog.cs')} | ${code(b.propertyEvidence || screen.source)} |`).join('\n')+'\n\n'+sourceNote(screen.source + '#screens/' + id);
      await doc('modules/' + id + '-fields', title + ' · Trường dữ liệu', fields);
      agentChunks.push('# '+title+' · Trường dữ liệu\n\n'+fields);
      searchIndex.push({title:title+' · Trường dữ liệu',url:'/docs/modules/'+id+'-fields',kind:'Trường dữ liệu',text:Object.values(screen.fields).flat().map(f=>f.name+' '+f.column).join(' ')});
    }
  }
}
// Cover any contract module absent from the user-facing help hierarchy explicitly.
const unmatched = [...new Set(operations.map(o=>o.module).filter(id=>id&&screenById[id]&&!moduleIndex.some(m=>m.id===id)))];
if (unmatched.length) throw new Error('Unmapped ERP modules: ' + unmatched.join(', '));
const groupsSidebar = helpGroups.map(group=>({type:'category',key:'group-'+group.id,label:group.title,collapsed:true,items:[
  ...group.guides.map(moduleCategory),
  ...(group.sections || []).map(section=>({type:'category',key:group.id+'-'+section.id,label:section.title,items:section.guides.map(moduleCategory)})),
]}));
function moduleCategory(id) {
  const ops=operations.filter(op=>op.module===id);
  if (!ops.length) return {type:'doc',key:'module-'+id,id:'modules/'+id,label:(titles[id]||id)+' · Chưa có API'};
  return {type:'category',key:'module-'+id,label:titles[id]||id,link:{type:'doc',id:'modules/'+id},items:[...(screenById[id]?['modules/'+id+'-fields']:[]),...ops.map(op=>({type:'doc',key:op.operationId,id:'api/'+op.slug,label:op.method+' '+(op.path.replace('/api/erp/'+id,'')||'/')}))]};
}
const shared = operations.filter(op=>!screenById[op.module]);
const referenceBindingsPath='inventories/backend/20261011/api-reference-bindings.json';
const referenceBindingsBytes=await fs.readFile(path.join(repo,referenceBindingsPath));
sourceHashes.push({path:referenceBindingsPath,sha256:crypto.createHash('sha256').update(referenceBindingsBytes).digest('hex')});
const referenceBindings=JSON.parse(referenceBindingsBytes);
await doc('foundation/reference-data','Dữ liệu tham chiếu và tên hiển thị',`Bảng này mô tả ánh xạ kỹ thuật để API bổ sung tên hiển thị. Đây không phải danh sách bản ghi hoặc giá trị lựa chọn thực tế; cần tải các giá trị qua API được cấp quyền.\n\n${sourceNote(referenceBindingsPath)}\n\n`+referenceBindings.bindings.map(b=>`## ${b.id}\n\nBảng SQL: ${code(b.table)} · trường mã ${code(b.key)} · trường tên ${code(b.label)}.\n\nTên trường nguồn tương ứng: ${(b.aliases||[]).map(code).join(', ')}. Trường bổ sung: ${(b.extras||[]).map(code).join(', ')||'—'}.\n\n| Cột | Kiểu SQL | Cho phép null |\n|---|---|---|\n${b.columns.map(c=>`| ${code(c.name)} | ${code(c.type+(c.typeArguments||''))} | ${c.nullable?'Có':'Không'} |`).join('\n')}\n`).join('\n'));
const foundations = ['foundation/overview','foundation/quickstart','foundation/auth','foundation/metadata','foundation/reference-data','foundation/errors','foundation/ui','foundation/contracts','foundation/evidence'];
const sidebar = {developer:[{type:'category',label:'Bắt đầu tích hợp',collapsed:false,items:foundations},...groupsSidebar,{type:'category',label:'API nền tảng & tương thích',items:shared.map(op=>({type:'doc',id:'api/'+op.slug,label:op.method+' '+op.path}))},{type:'category',label:'Tài nguyên tích hợp',items:['agents/context','agents/task-template','agents/validation']}]};
await fs.writeFile(path.join(root,'sidebars.js'),'// Generated by scripts/generate.mjs from /help and OpenAPI.\nmodule.exports = '+JSON.stringify(sidebar,null,2)+';\n');
await fs.mkdir(path.join(root,'src/data'),{recursive:true});
const data = {provenance,helpGroups,modules:moduleIndex,operations,spec,sourceHashes};
await fs.writeFile(path.join(root,'src/data/catalog.json'),JSON.stringify(data));
const guidePages = [
 ['foundation/overview','Tổng quan kỹ thuật'],['foundation/quickstart','Khởi tạo kết nối'],['foundation/auth','Phiên đăng nhập, CSRF và phạm vi dữ liệu'],['foundation/metadata','Mô tả trường dữ liệu'],['foundation/reference-data','Dữ liệu tham chiếu và tên hiển thị'],['foundation/errors','Lỗi & recovery'],['foundation/ui','Quy tắc xây dựng UI'],['foundation/contracts','Tra cứu cấu trúc dữ liệu'],['foundation/evidence','Nguồn và mức xác minh'],['agents/context','Tệp đặc tả và tài liệu'],['agents/task-template','Mẫu yêu cầu triển khai'],['agents/validation','Danh sách kiểm tra giao diện'],
];
searchIndex.push(...guidePages.map(([id,title])=>({title,url:'/docs/'+id,kind:'Hướng dẫn',text:title})));
await fs.mkdir(path.join(root,'static/context'),{recursive:true});
await fs.writeFile(path.join(root,'static/search-index.json'),JSON.stringify(searchIndex));
await fs.copyFile(path.join(root,'contracts/openapi.json'),path.join(root,'static/openapi.json'));
await fs.writeFile(path.join(root,'static/context/modules.json'),JSON.stringify(moduleIndex,null,2));
await fs.writeFile(path.join(root,'static/context/operations.json'),JSON.stringify(operations.map(o=>({operationId:o.operationId,method:o.method,path:o.path,module:o.module,doc:linkOperation(o)})),null,2));
await fs.writeFile(path.join(root,'static/context/provenance.json'),JSON.stringify({...provenance,sourceHashes,helpSha256:crypto.createHash('sha256').update(helpSource).digest('hex'),liveMetadata:'401 without session; UNKNOWN authenticated values',libraryArchiveAccess:'Unavailable; no rehash or direct inspection claimed'},null,2));
await fs.writeFile(path.join(root,'static/llms.txt'),`# Tài liệu kỹ thuật Medcom ERP\n\nĐặc tả kỹ thuật Medcom ERP bằng tiếng Việt. Phiên bản ${provenance.version}; mã kiểm tra SHA-256 ${provenance.sha256}.\nKhông suy ra quyền hoặc trạng thái nghiệp vụ chỉ từ việc đường dẫn API tồn tại.\n\n## Mục lục\n- [Tệp tài liệu](/docs/agents/context)\n- [Toàn bộ tài liệu](/llms-full.txt)\n- [OpenAPI](/openapi.json)\n- [Danh mục API](/context/operations.json)\n- [Phân hệ](/context/modules.json)\n- [Nguồn tham chiếu](/context/provenance.json)\n\n## Phân hệ nghiệp vụ\n${moduleIndex.map(m=>`- [${m.title}](/docs/modules/${m.id}): ${m.available?'contract present':'Feature; mapping UNKNOWN'}`).join('\n')}\n`);
const foundationText=[];
for(const [id]of guidePages){try{foundationText.push(await fs.readFile(path.join(root,'docs',id+'.mdx'),'utf8'));}catch{}}
await fs.writeFile(path.join(root,'static/llms-full.txt'),`# Nội dung kỹ thuật Medcom ERP\n\nSnapshot ${provenance.sha256}\n${JSON.stringify(provenance)}\n\n${foundationText.join('\n\n')}\n\n${agentChunks.join('\n\n---\n\n')}`);
for(const [from,to]of [['medcom-logo.png','medcom-logo.png'],['medcom-logo-dark.png','medcom-logo-dark.png']])await fs.copyFile(path.join(repo,'apps/medcom-sites/public',from),path.join(root,'static/img',to));
const coverage={operations:operations.length,schemas:Object.keys(spec.components.schemas).length,helpEntries:moduleIndex.length,mappedModules:moduleIndex.filter(m=>m.available).length,featureEntries:moduleIndex.filter(m=>!m.available).length,sourceFields:moduleIndex.reduce((n,m)=>n+m.fields,0),generatedApiPages:operations.length,duplicateOperationIds:operations.length-new Set(operations.map(o=>o.operationId)).size};
await fs.writeFile(path.join(root,'contracts/coverage.json'),JSON.stringify(coverage,null,2)+'\n');
console.log(JSON.stringify(coverage));
