/* Small, deliberately constrained Markdown renderer. All source text is escaped. */
(function (global) {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  function inline(value) {
    const parts = String(value).split(/(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g);
    return parts.map(part => {
      if (part.startsWith('`') && part.endsWith('`')) return `<code>${escape(part.slice(1,-1))}</code>`;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const [,label,url] = link;
        if (/^#[a-z][a-z0-9-]*(?:\/(?:guide|flow|errors))?$/.test(url) || /^https:\/\//i.test(url)) return `<a href="${escape(url)}">${escape(label)}</a>`;
        return escape(label);
      }
      return escape(part).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    }).join('');
  }
  function markdown(source) {
    const lines = source.replace(/\r/g,'').split('\n');
    const out=[]; let n=0, section=false;
    const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
    while(n<lines.length) {
      const line=lines[n];
      if(!line.trim()){n++;continue;}
      const heading=line.match(/^(#{2,3}) (.+)$/);
      if(heading){
        if(heading[1]==='##') {
          if(section)out.push('</section>');
          const numbered=heading[2].match(/^(\d+)\. (.+)$/);
          out.push(`<section class="content-section${numbered?' step-section':''}">`);
          section=true;
          out.push(numbered?`<h2><span class="step-number">${escape(numbered[1])}</span>${inline(numbered[2])}</h2>`:`<h2>${inline(heading[2])}</h2>`);
        } else out.push(`<h3>${inline(heading[2])}</h3>`);
        n++;continue;
      }
      if(line.startsWith('> ')){
        const group=[];while(n<lines.length&&lines[n].startsWith('> '))group.push(lines[n++].slice(2));
        out.push(`<aside class="info-banner"><span class="info-symbol" aria-hidden="true">i</span><p>${inline(group.join(' '))}</p></aside>`);continue;
      }
      if(line.startsWith('|')&&/^\|[\s:|\-]+\|?$/.test(lines[n+1]||'')){
        const heads=cells(line);n+=2;const rows=[];
        while(n<lines.length&&lines[n].startsWith('|'))rows.push(cells(lines[n++]));
        out.push(`<div class="table-scroll" tabindex="0" role="region" aria-label="Bảng thông tin"><table><thead><tr>${heads.map(x=>`<th scope="col">${inline(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${heads.map((_,i)=>`<td>${inline(row[i]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;
      }
      if(line.startsWith('- ')){
        const items=[];while(n<lines.length&&lines[n].startsWith('- '))items.push(lines[n++].slice(2));
        out.push(`<ul>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</ul>`);continue;
      }
      const paragraph=[];
      while(n<lines.length&&lines[n].trim()&&!/^(##? |### |> |\|\s*|- )/.test(lines[n]))paragraph.push(lines[n++]);
      if(!paragraph.length)paragraph.push(lines[n++]);
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
    if(section)out.push('</section>');
    return out.join('\n');
  }
  function route(hash, catalog) {
    const [requested,tab]=hash.replace(/^#/,'').split('/');
    return {id:catalog.articles.some(a=>a.id===requested)?requested:catalog.defaultArticle,tab:['guide','flow','errors'].includes(tab)?tab:'guide'};
  }
  function search(query,articles) {
    const terms=fold(query).trim().split(/\s+/).filter(Boolean);
    if(!terms.length)return [];
    return articles.flatMap(article=>{
      const title=fold(article.title), body=fold(article.guide+' '+article.technical+' '+article.errors.flat().join(' '));
      if(!terms.every(t=>(title+' '+body).includes(t)))return [];
      const phrase=terms.join(' '),guide=fold(article.guide);
      const phraseCount=guide.split(phrase).length-1;
      const headings=guide.split('\n').filter(line=>line.startsWith('## ')).join(' ');
      const score=terms.reduce((s,t)=>s+(title.includes(t)?8:1),0)+Math.min(phraseCount,8)*3+(headings.includes(phrase)?12:0);
      return [{article,score,technical:!terms.every(t=>fold(article.guide+' '+article.title+' '+article.errors.flat().join(' ')).includes(t))}];
    }).sort((a,b)=>b.score-a.score);
  }
  global.HelpCore={escape,fold,inline,markdown,route,search};
})(globalThis);
