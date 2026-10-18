import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Icon from '../components/Icon';
import catalog from '../data/catalog.json';

export default function Home(){return <Layout title="Tài liệu kỹ thuật Medcom ERP" description="Tra cứu API, cấu trúc dữ liệu và quy trình xử lý của Medcom ERP.">
  <main className="docs-index">
    <header className="docs-index-header"><h1>Tài liệu kỹ thuật Medcom ERP</h1><p>Tra cứu API, cấu trúc chứng từ, trường dữ liệu và quy trình xử lý theo từng phân hệ.</p></header>
    <nav className="docs-quick-links" aria-label="Tra cứu nhanh">{[['code','Danh mục API','/api'],['database','Trường dữ liệu','/docs/foundation/metadata'],['shield','Xác thực và phân quyền','/docs/foundation/auth'],['book','Lỗi và cách xử lý','/docs/foundation/errors']].map(([icon,title,to])=><Link key={to} to={to}><Icon name={icon} size={19}/><span>{title}</span><Icon name="arrow" size={16}/></Link>)}</nav>
    <section aria-labelledby="business-heading"><h2 id="business-heading">Phân hệ nghiệp vụ</h2><div className="docs-module-grid">{catalog.helpGroups.map((group,i)=>{
      const sections=[...(group.guides.length?[{title:null,guides:group.guides}]:[]),...(group.sections||[])];
      return <section className="docs-module-group" key={group.id}><h3><Icon name={['book','grid','database','shield'][i]} size={21}/>{group.title}</h3>{sections.map((section,j)=><div key={j}>{section.title&&<h4>{section.title}</h4>}<ul>{section.guides.map(id=>{const module=catalog.modules.find(m=>m.id===id);return <li key={id}><Link to={'/docs/modules/'+id}>{module.title}</Link>{!module.available&&<span className="module-pending">Chưa có API</span>}</li>})}</ul></div>)}</section>;
    })}</div></section>
    <section className="docs-index-resources"><h2>Hướng dẫn tích hợp</h2><div>{[['Khởi tạo kết nối','Đăng nhập, chọn chi nhánh, tải quyền và dữ liệu.','/docs/foundation/quickstart'],['Quy tắc xây dựng giao diện','Phân trang, danh sách lựa chọn, phiên bản chứng từ và xử lý kết quả.','/docs/foundation/ui'],['Tệp đặc tả và tài liệu','OpenAPI, mục lục API và tài liệu đầy đủ có thể tải về.','/docs/agents/context'],['Nguồn dữ liệu và phạm vi xác minh','Nguồn tham chiếu, mã kiểm tra và các nội dung chưa được xác nhận.','/docs/foundation/evidence']].map(([title,desc,to])=><Link key={to} to={to}><strong>{title}<Icon name="arrow" size={16}/></strong><p>{desc}</p></Link>)}</div></section>
  </main>
  </Layout>}
