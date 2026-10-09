import {readFileSync} from 'node:fs';

// The compiled production CSS uses these same-origin, tracked static assets.
// Explicit names keep synthetic network guards closed to arbitrary requests.
export const localFontPaths = Object.freeze(['latin','latin-ext','vietnamese'].flatMap(subset=>
 [400,500,600].map(weight=>`/fonts/inter/inter-${subset}-${weight}-normal.woff2`)));
const paths=new Set(localFontPaths);
export function serveLocalFont(request,response){
 if(!paths.has(request.url))return false;
 response.setHeader('Content-Type','font/woff2');
 response.end(readFileSync(new URL('../public'+request.url,import.meta.url)));
 return true;
}
