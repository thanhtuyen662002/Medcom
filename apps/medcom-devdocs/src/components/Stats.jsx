import React from 'react';
import catalog from '../data/catalog.json';
export default function Stats(){return <div className="doc-stats">{[[catalog.operations.length,'API'],[Object.keys(catalog.spec.components.schemas).length,'Cấu trúc dữ liệu'],[catalog.modules.filter(m=>m.available).length,'Phân hệ ERP']].map(([n,label])=><div key={label}><strong>{n.toLocaleString('en')}</strong><span>{label}</span></div>)}</div>}
