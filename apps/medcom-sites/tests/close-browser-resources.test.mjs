import assert from 'node:assert/strict';
import test from 'node:test';
import {closeBrowserResources} from './close-browser-resources.mjs';

test('browser shutdown waits for its delayed context and then closes the server',async()=>{
 const calls=[];let finish;const barrier=new Promise(resolve=>{finish=resolve;});let contextClosed=false;
 const closing=closeBrowserResources({async close(){calls.push('context');await barrier;contextClosed=true;}},
  {async close(){assert.equal(contextClosed,true,'parent must wait for child close');calls.push('browser');}},()=>calls.push('server'));
 await Promise.resolve();assert.deepEqual(calls,['context']);finish();await closing;
 assert.deepEqual(calls,['context','browser','server']);
});
test('a context close error remains visible and cannot strand the browser or server',async()=>{
 const failure=new Error('synthetic child shutdown failed'),calls=[];
 await assert.rejects(closeBrowserResources({async close(){calls.push('context');throw failure;}},
  {async close(){calls.push('browser');}},()=>calls.push('server')),error=>{
   assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors,[failure]);assert.match(error.message,/context: Error: synthetic child shutdown failed/);return true;
  });assert.deepEqual(calls,['context','browser','server']);
});
test('all shutdown errors retain owner labels and original causes',async()=>{
 const errors=[new Error('synthetic context'),new Error('synthetic browser'),new Error('synthetic server')];
 await assert.rejects(closeBrowserResources({close(){throw errors[0];}},{close(){throw errors[1];}},()=>{throw errors[2];}),error=>{
  assert.deepEqual(error.errors,errors);for(const name of ['context','browser','server'])assert.ok(error.message.includes(name+':'));return true;
 });
});
test('early setup failure still closes the server when browser resources are absent',async()=>{
 let closed=0;await closeBrowserResources(undefined,undefined,()=>closed++);assert.equal(closed,1);
});
