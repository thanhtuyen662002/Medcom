// A context belongs to its browser. Finish its close before closing the parent,
// and retain every shutdown failure while still attempting the remaining owners.
export async function closeBrowserResources(context,browser,closeServer) {
 const failures=[];
 for(const [resource,close] of [['context',()=>context?.close()],['browser',()=>browser?.close()],['server',closeServer]]) {
  try {await close?.();}catch(error){failures.push({resource,error});}
 }
 if(failures.length)throw new AggregateError(failures.map(({error})=>error),
  'I30 browser teardown failed: '+failures.map(({resource,error})=>resource+': '+String(error)).join('; '));
}
