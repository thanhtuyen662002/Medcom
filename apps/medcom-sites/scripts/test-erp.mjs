import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';import {spawnSync} from 'node:child_process';
const output='.sites-runtime/erp-tests';mkdirSync(output,{recursive:true});
for(const name of ['contracts','catalog','navigation','api']){let source=readFileSync(`lib/erp/${name}.ts`,'utf8');source=source.replaceAll('from "./contracts"','from "./contracts.js"').replaceAll('from "./catalog"','from "./catalog.js"');writeFileSync(`${output}/${name}.js`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
const r=spawnSync(process.execPath,['--experimental-strip-types','--test','tests/proxy-policy.test.ts','tests/api.test.mjs','tests/navigation.test.mjs'],{stdio:'inherit'});process.exit(r.status??1);
