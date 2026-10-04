import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ErpGrid,DocumentEditor,RoleNavigationEditor,ErrorPanel,ApiError} from '../.test-runtime/erp-tests/ui-components.js';
test('shared grid renders semantic mobile cards and reachable desktop cell roles from supplied data',()=>{
 const html=renderToStaticMarkup(h(ErpGrid,{rows:[{id:'synthetic-1',value:'1.0000'}],columns:[{id:'identity',label:'Identity',width:200,required:true},{id:'value',label:'Value',width:160}],rowId:r=>r.id,renderCell:(r,c)=>c==='identity'?r.id:r.value,mobileCard:r=>h('strong',null,r.id),onOpen:()=>{},schemaVersion:'1',scopeKey:'test',compact:false,label:'Synthetic grid'}));
 assert.match(html,/role="grid"/);assert.match(html,/role="gridcell"/);assert.match(html,/aria-rowcount="2"/);assert.match(html,/mobile-document-card/);assert.match(html,/1\.0000/);assert.doesNotMatch(html,/Chọn toàn bộ kết quả/);
});
test('an unprivileged role configuration cannot render publish controls',()=>{
 const html=renderToStaticMarkup(h(RoleNavigationEditor,{configuration:{roleId:'test',roleLabel:'Test',version:'1',canPublish:false,entries:[],allowedTargets:[]},adapter:{publish:()=>{throw Error('must not run');},reload:()=>{throw Error('must not run');}},onPublished:()=>{},onDenied:()=>{}}));assert.equal(html,'');
});
test('document editor preserves decimal strings and cannot initially announce save success',()=>{
 const html=renderToStaticMarkup(h(DocumentEditor,{snapshot:{id:'synthetic',version:'opaque',values:{quantity:'12345678901234567890.1234'},definition:{id:'screen',version:'1',label:'Test',sections:[{id:'main',label:'Main'}],fields:[{id:'quantity',sectionId:'main',kind:'decimal',label:'Quantity'}],actions:[{id:'save',label:'Save',enabled:true}]}},adapter:{save:()=>{throw Error('must not run');},reconcile:()=>{throw Error('must not run');},reload:()=>{throw Error('must not run');}},lookupAdapter:()=>{throw Error('must not run');},onConfirmed:()=>{},onDenied:()=>{}}));assert.match(html,/value="12345678901234567890\.1234"/);assert.match(html,/Chưa thay đổi/);assert.doesNotMatch(html,/Đã lưu chứng từ/);assert.match(html,/disabled=""/);
});
test('support references are escaped by React and never executed as markup',()=>{
 const html=renderToStaticMarkup(h(ErpGrid,{rows:[{id:'<script>bad</script>'}],columns:[{id:'id',label:'<img onerror=bad>',width:200,required:true}],rowId:r=>r.id,renderCell:r=>r.id,mobileCard:r=>r.id,onOpen:()=>{},schemaVersion:'1',scopeKey:'test',compact:false,label:'Safe'}));assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);const error=renderToStaticMarkup(h(ErrorPanel,{error:new ApiError(500,'failed','<script>support</script>')}));assert.match(error,/Mã hỗ trợ/);assert.match(error,/&lt;script&gt;support/);assert.doesNotMatch(error,/<script>/);
});
