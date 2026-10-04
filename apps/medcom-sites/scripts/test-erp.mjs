import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const output='.sites-runtime/erp-tests';mkdirSync(output,{recursive:true});
for(const name of ['contracts','catalog','navigation','api','presentation','ui-contracts']){let source=readFileSync(`lib/erp/${name}.ts`,'utf8');source=source.replaceAll('from "./contracts"','from "./contracts.js"').replaceAll('from "./catalog"','from "./catalog.js"');writeFileSync(`${output}/${name}.js`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
// Use Vite's locked esbuild dependency for server-render component checks, not browser QA.
const require=createRequire(import.meta.url);const viteRequire=createRequire(require.resolve('vite/package.json'));const {build}=viteRequire('esbuild');
await build({stdin:{contents:'export {ErpGrid} from "./components/erp/grid"; export {DocumentEditor} from "./components/erp/document-editor"; export {RoleNavigationEditor} from "./components/erp/role-navigation-editor"; export {ErrorPanel} from "./components/erp/feedback"; export {ApiError} from "./lib/erp/api";',resolveDir:process.cwd(),loader:'tsx'},outfile:`${output}/ui-components.js`,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':process.cwd()},jsx:'automatic',logLevel:'warning'});
const r=spawnSync(process.execPath,['--experimental-strip-types','--test','tests/proxy-policy.test.ts','tests/api.test.mjs','tests/navigation.test.mjs','tests/presentation.test.mjs','tests/components.test.mjs'],{stdio:'inherit'});process.exit(r.status??1);
