import type {ItemDisplayBinding,ItemDisplayContext,ItemDisplaySourceLine} from "@/lib/erp/item-display";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {ItemIdentity} from "./item-identity";

type Column<Line>={label:string;value:(line:Line)=>string|number|null;numeric?:boolean};

/** One source row and one identity group at every viewport. Values stay exact;
 * only the table's presentation changes to labelled rows on small screens. */
export function RecordLinesTable<Line extends ItemDisplaySourceLine>({lines,binding,context,columns,offset=0,nullLabel="NULL",label="Dòng hàng",indexedKey=false}:{
 lines:readonly Line[];binding:ItemDisplayBinding;context?:ItemDisplayContext|null;
 columns:readonly Column<Line>[];offset?:number;nullLabel?:string;label?:string;indexedKey?:boolean;
}){
 return <Table role="table" aria-label={label} className="record-lines-table">
  <TableHeader role="rowgroup"><TableRow role="row"><TableHead role="columnheader" scope="col" className="record-line-ordinal">STT</TableHead><TableHead role="columnheader" scope="col">Mặt hàng</TableHead>{columns.map(column=><TableHead role="columnheader" scope="col" className={column.numeric===false?"record-line-text":"record-line-quantity"} key={column.label}>{column.label}</TableHead>)}</TableRow></TableHeader>
  <TableBody role="rowgroup">{lines.map((line,index)=><TableRow role="row" key={indexedKey?`${index}:${line.lineId}`:line.lineId}>
   <TableCell role="cell" className="record-line-ordinal" data-label="STT"><span>{offset+index+1}</span></TableCell>
   <TableCell role="cell" className="record-line-identity"><ItemIdentity binding={binding} context={context} line={line}/></TableCell>
   {columns.map(column=><TableCell role="cell" key={column.label} className={column.numeric===false?"record-line-text":"record-line-quantity"} data-label={column.label}><span>{column.value(line)??nullLabel}</span></TableCell>)}
  </TableRow>)}</TableBody>
 </Table>;
}
