(function () {
  'use strict';
  const docs=window.MEDCOM_DOCS, core=window.HelpCore;
  if(!docs||!core)return;
  const $=id=>document.getElementById(id), esc=core.escape;
  const mode=document.documentElement.dataset.mode;
  const root=document.documentElement.dataset.root;
  let current, activeTab='guide', renderToken=0, diagramLoader;
  const icons={
    overview:'M4 3h11l5 5v13H4z M14 3v6h6 M8 13h8 M8 17h6',
    purchasing:'M3 3h2l3 12h11l3-9H6 M9 20h.1 M18 20h.1',
    inbound:'M4 3h11l5 5v13H4z M14 3v6h6 M8 13h8 M8 17h6',
    bptm:'M3 5h18v15H3z M7 2v6 M17 2v6 M3 10h18 M7 14h4 M7 17h7',
    sales:'M4 6h16v15H4z M8 6V3h8v3 M8 11h8 M8 15h5',
    'internal-transfer':'M3 7h17l-4-4 M21 17H4l4 4 M20 7l-4 4 M4 17l4-4',
    'machine-lifecycle':'M3 9l9-6 9 6H3z M5 11v8 M10 11v8 M15 11v8 M20 11v8 M3 21h18',
    'qr-parts':'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h2v2h-2z M19 15h2v6h-6v-2',
    'import-costs':'M3 6c0-4 12-4 12 0s-12 4-12 0 M3 6v12c0 4 12 4 12 0V6 M3 12c0 4 12 4 12 0 M19 9v12 M17 11l2-2 2 2'
  };
  const icon=id=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[id]||icons.overview}"/></svg>`;
  const navTitles={overview:'Tổng quan',purchasing:'Mua hàng',inbound:'Đề nghị nhập hàng',bptm:'Theo dõi đợt hàng',sales:'Bán hàng','internal-transfer':'Điều chuyển nội bộ','machine-lifecycle':'Quản lý tài sản','qr-parts':'Quản lý linh kiện','import-costs':'Phân bổ chi phí'};
  function nav(){
    let group='';
    $('article-nav').innerHTML=docs.articles.map(a=>{
      let heading='';if(a.group!==group){group=a.group;heading=`<p class="nav-group">${esc(group)}</p>`;}
      return heading+`<a class="nav-link" href="#${a.id}" data-article="${a.id}">${icon(a.id)}<span>${esc(navTitles[a.id]||a.title)}</span></a>`;
    }).join('');
    $('version').textContent=docs.version;
    $(mode==='technical'?'technical-link':'guide-link').classList.add('active');
    $(mode==='technical'?'technical-link':'guide-link').setAttribute('aria-current','page');
  }
  function closeMenu(){
    $('sidebar').classList.remove('open');$('sidebar-shade').hidden=true;$('menu-toggle').setAttribute('aria-expanded','false');
    $('sidebar').inert=window.matchMedia('(max-width:680px)').matches;
  }
  function toast(message){
    $('toast').textContent=message;$('toast').hidden=false;
    clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,2800);
  }
  const relations={
    overview:['purchasing','inbound','internal-transfer'],purchasing:['inbound','bptm','import-costs'],inbound:['purchasing','import-costs','bptm'],
    sales:['machine-lifecycle','qr-parts','internal-transfer'],'internal-transfer':['machine-lifecycle','qr-parts','inbound'],
    'machine-lifecycle':['qr-parts','internal-transfer','sales'],'qr-parts':['machine-lifecycle','internal-transfer','inbound'],
    bptm:['purchasing','inbound','import-costs'],'import-costs':['inbound','purchasing','bptm']
  };
  function render(){
    const route=core.route(location.hash,docs), previous=current?.id;
    current=docs.articles.find(a=>a.id===route.id);activeTab=route.tab;
    document.title=`${current.title} · ${mode==='technical'?'Tài liệu kỹ thuật':'Hướng dẫn'} MEDCOM ERP`;
    $('guide-link').href=`${root}HDSD-ERP/#${current.id}`;
    $('technical-link').href=`${root}TLKT/#${current.id}`;
    for(const link of document.querySelectorAll('[data-article]')){
      const selected=link.dataset.article===current.id;link.classList.toggle('active',selected);
      if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    $('breadcrumb').innerHTML=`<a href="#overview" aria-label="Tổng quan">⌂</a><span aria-hidden="true">›</span><span>${esc(current.group)}</span><span aria-hidden="true">›</span><span>${esc(current.id==='overview'?'Tổng quan':current.id==='inbound'?'Đề nghị nhập hàng':current.title)}</span>`;
    $('article-kind').textContent=mode==='technical'?'TÀI LIỆU KỸ THUẬT':'HƯỚNG DẪN SỬ DỤNG';
    $('article-title').textContent=current.title;
    $('article-subtitle').textContent=mode==='technical'?'Luồng xử lý, điểm liên kết dữ liệu và các đối tượng DB liên quan.':current.subtitle;
    const reviewDate=current.reviewed.split('-').reverse().join('/');
    $('article-meta').innerHTML=`<span>${mode==='technical'?'Dành cho đội phát triển':'Vai trò: '+esc(current.roles.join(' · '))}</span><span>Cập nhật ${esc(reviewDate)}</span>`;
    $('tab-guide').textContent=mode==='technical'?'Luồng xử lý':'Hướng dẫn';
    $('tab-errors').textContent=mode==='technical'?'Form & SQL':'Xử lý lỗi';
    for(const btn of document.querySelectorAll('[data-tab]')){
      const selected=btn.dataset.tab===activeTab;btn.setAttribute('aria-selected',String(selected));btn.tabIndex=selected?0:-1;
    }
    const panel=$('panel');panel.className=mode==='technical'?'technical-panel':'';
    panel.setAttribute('aria-labelledby',`tab-${activeTab}`);
    const token=++renderToken;
    if(activeTab==='guide') panel.innerHTML=core.markdown(mode==='technical'?current.technical:current.guide);
    else if(activeTab==='flow') {
      panel.innerHTML=`<aside class="info-banner"><span class="info-symbol" aria-hidden="true">i</span><p>Sơ đồ thể hiện đường đi nghiệp vụ và các nhánh chính. Các bước xử lý chi tiết nằm trong tab ${mode==='technical'?'Luồng xử lý':'Hướng dẫn'}.</p></aside><div class="flow-toolbar"><h2>Sơ đồ quy trình</h2><div class="flow-controls"><button id="zoom-out" aria-label="Thu nhỏ sơ đồ">−</button><span id="zoom-label" aria-live="polite">100%</span><button id="zoom-in" aria-label="Phóng to sơ đồ">+</button><button id="zoom-reset">Vừa khung</button><button id="download-svg">Tải SVG</button></div></div><div class="diagram-viewport" id="diagram" tabindex="0" role="region" aria-label="Sơ đồ ${esc(current.title)}"><p class="flow-fallback">Đang vẽ sơ đồ…</p></div><p class="diagram-note">Có thể phóng to và cuộn để xem các nhánh. Tải SVG để đưa vào tài liệu khác.</p><details class="flow-source"><summary>Xem mã sơ đồ Mermaid</summary><pre>${esc(current.flow)}</pre></details>`;
      renderDiagram(current.flow,token);
    } else if(mode==='technical') {
      const source=current.technical.indexOf('## Màn hình liên quan');
      panel.innerHTML=source<0?core.markdown('## Bản đồ liên kết\n\nChọn một quy trình cụ thể để xem tên form và các đối tượng DB.'):core.markdown(current.technical.slice(source));
    } else panel.innerHTML=`<h2 class="panel-heading">Khi thao tác chưa thành công</h2><p class="error-empty">Chọn tình huống để xem điểm cần kiểm tra.</p><div class="error-list">${current.errors.map(([title,answer])=>`<details><summary>${esc(title)}</summary><p>${esc(answer)}</p></details>`).join('')}</div>`;
    $('stage-strip').innerHTML=current.stages.map((s,i)=>`<div class="stage"><span class="stage-icon">${i+1}</span><span>${esc(s)}</span></div>`).join('');
    $('related-links').innerHTML=(relations[current.id]||[]).map(id=>{const a=docs.articles.find(a=>a.id===id);return `<a href="#${id}">${esc(a.title)}<span aria-hidden="true">→</span></a>`;}).join('');
    $('review-date').textContent=`Đối chiếu tài liệu và cấu hình: ${reviewDate}`;
    closeMenu();if(previous!==current.id)window.scrollTo({top:0,behavior:'instant'});
  }
  function loadDiagram(){
    if(window.mermaid)return Promise.resolve(window.mermaid);
    if(!diagramLoader)diagramLoader=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=`${root}assets/vendor/mermaid-12.2.0.min.js`;
      script.onload=()=>window.mermaid?resolve(window.mermaid):reject(new Error('Mermaid unavailable'));
      script.onerror=reject;document.head.append(script);
    });
    return diagramLoader;
  }
  async function renderDiagram(source,token){
    try{
      const mermaid=await loadDiagram();if(token!==renderToken)return;
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',fontFamily:'Segoe UI, Arial, sans-serif',themeVariables:{primaryColor:'#edf5ff',primaryTextColor:'#183e70',primaryBorderColor:'#89b3f6',lineColor:'#7898c0',secondaryColor:'#f1fbf7',tertiaryColor:'#fff9ed',fontSize:'14px'},flowchart:{htmlLabels:false,curve:'basis',useMaxWidth:false,nodeSpacing:30,rankSpacing:45}});
      const rendered=await mermaid.render(`flow-${token}`,source);if(token!==renderToken)return;
      $('diagram').innerHTML=rendered.svg;
      const svg=$('diagram').querySelector('svg');svg.setAttribute('role','img');svg.setAttribute('aria-label',`Sơ đồ ${current.title}`);
      const natural=svg.viewBox.baseVal.width||900;let zoom=1;
      function fit(){return Math.min(natural,Math.max($('diagram').clientWidth-48,200));}
      function scale(){svg.style.width=`${fit()*zoom}px`;$('zoom-label').textContent=`${Math.round(zoom*100)}%`;}
      $('zoom-in').onclick=()=>{zoom=Math.min(zoom+.25,3);scale();};
      $('zoom-out').onclick=()=>{zoom=Math.max(zoom-.25,.5);scale();};
      $('zoom-reset').onclick=()=>{zoom=1;scale();};
      $('download-svg').onclick=()=>{
        const standalone=svg.cloneNode(true);standalone.setAttribute('xmlns','http://www.w3.org/2000/svg');standalone.removeAttribute('style');standalone.setAttribute('width',natural);standalone.setAttribute('height',svg.viewBox.baseVal.height);
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(standalone)],{type:'image/svg+xml;charset=utf-8'}));
        const a=document.createElement('a');a.href=url;a.download=`medcom-${current.id}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
      };scale();
    }catch(error){if(token!==renderToken)return;$('diagram').innerHTML=`<p class="flow-fallback">Chưa tải được bộ vẽ sơ đồ. Bạn có thể xem các giai đoạn bên dưới hoặc mở mã Mermaid.</p>`;for(const b of document.querySelectorAll('.flow-controls button'))b.disabled=true;}
  }
  for(const btn of document.querySelectorAll('[data-tab]'))btn.addEventListener('click',()=>{location.hash=`${current.id}${btn.dataset.tab==='guide'?'':'/'+btn.dataset.tab}`;});
  document.querySelector('.tabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=[...document.querySelectorAll('[data-tab]')],index=tabs.indexOf(document.activeElement);if(index<0)return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;tabs[next].click();tabs[next].focus();
  });
  const dialog=$('search-dialog'),input=$('search-input');
  function search(){
    const query=input.value.trim(), results=core.search(query,docs.articles);
    $('search-results').innerHTML=!query?'<div class="search-empty">Ví dụ: “gửi thủ kho”, “nhận từng phần”, “hiệu lực”, “BatchReceiveStp”.</div>':!results.length?'<div class="search-empty">Chưa có kết quả. Thử từ khóa ngắn hơn hoặc tên quy trình.</div>':results.map(({article,technical})=>{
      const target=technical?'TLKT':mode==='technical'?'TLKT':'HDSD-ERP';
      return `<a class="search-result" href="${root}${target}/#${article.id}"><strong>${esc(article.title)}</strong><small>${technical?'Tài liệu kỹ thuật':mode==='technical'?'Tài liệu kỹ thuật':'Hướng dẫn sử dụng'} · ${esc(article.group)}</small><p>${esc(article.subtitle)}</p></a>`;
    }).join('');
  }
  function openSearch(){dialog.showModal();input.value='';search();input.focus();}
  $('search-open').onclick=openSearch;$('search-close').onclick=()=>dialog.close();input.addEventListener('input',search);
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();if(e.target.closest('.search-result'))dialog.close();});
  input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('a')?.focus();}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!dialog.open)openSearch();}if(e.key==='Escape')closeMenu();});
  $('menu-toggle').onclick=()=>{const opened=$('sidebar').classList.toggle('open');$('sidebar').inert=!opened;$('sidebar-shade').hidden=!opened;$('menu-toggle').setAttribute('aria-expanded',String(opened));};
  window.matchMedia('(max-width:680px)').addEventListener('change',closeMenu);
  $('sidebar-shade').onclick=closeMenu;
  document.querySelector('.skip-link').onclick=event=>{event.preventDefault();$('main').focus();$('main').scrollIntoView();};
  $('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Đã sao chép liên kết bài');}catch{toast('Bạn có thể sao chép địa chỉ trên thanh trình duyệt');}};
  $('print').onclick=()=>{for(const detail of $('panel').querySelectorAll('.error-list details'))detail.open=true;window.print();};
  window.addEventListener('hashchange',render);
  nav();render();
})();
