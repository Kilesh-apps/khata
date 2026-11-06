/* Khata Excel export and restore. Builds a real .xlsx (with formulas and charts) in the browser, no libraries, no network. */
(function(root){
'use strict';
const enc=new TextEncoder(), dec=new TextDecoder();
const X=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'');
const col=n=>{let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
const ref=(r,c,abs)=>abs?'$'+col(c)+'$'+r:col(c)+r;
const serial=d=>{const[y,m,dd]=d.split('-').map(Number);return(Date.UTC(y,m-1,dd)-Date.UTC(1899,11,30))/864e5};

/* ---------- zip ---------- */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function zip(files){
  const parts=[],central=[];let off=0;
  for(const f of files){
    const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,0x21,true);
    h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);
    parts.push(new Uint8Array(h.buffer),name,data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(14,0x21,true);
    c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer),name);
    off+=30+name.length+data.length;
  }
  const cd=central.reduce((s,u)=>s+u.length,0),e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cd,true);e.setUint32(16,off,true);
  const all=[...parts,...central,new Uint8Array(e.buffer)],out=new Uint8Array(all.reduce((s,u)=>s+u.length,0));
  let p=0;for(const u of all){out.set(u,p);p+=u.length}return out;
}
async function unzip(buf){
  const u=new Uint8Array(buf),v=new DataView(u.buffer,u.byteOffset,u.byteLength);
  let e=u.length-22;while(e>=0&&v.getUint32(e,true)!==0x06054b50)e--;
  if(e<0) throw new Error('not a zip');
  const n=v.getUint16(e+10,true);let p=v.getUint32(e+16,true);const files={};
  for(let i=0;i<n;i++){
    const method=v.getUint16(p+10,true),cs=v.getUint32(p+20,true),nl=v.getUint16(p+28,true),xl=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),lo=v.getUint32(p+42,true);
    const name=dec.decode(u.subarray(p+46,p+46+nl));
    const start=lo+30+v.getUint16(lo+26,true)+v.getUint16(lo+28,true);
    files[name]={method,raw:u.subarray(start,start+cs)};p+=46+nl+xl+cl;
  }
  const bytes=async name=>{const f=files[name];if(!f) return null;
    return f.method===8?new Uint8Array(await new Response(new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()):f.raw};
  return{names:Object.keys(files),bytes,async text(name){const d=await bytes(name);return d==null?null:dec.decode(d)}};
}

/* ---------- styles ---------- */
// cellXfs index map
const ST={def:0,title:1,sub:2,head:3,text:4,money:5,date:6,totL:7,totM:8,pct:9,textB:10,moneyB:11,dateB:12,pctB:13,kpiL:14,kpiV:15,sect:16,input:17,totP:18,headR:19,note:20,moneyG:21,moneyR:22,kpiTop:23,num1:24,num1B:25};
const FMT_MONEY='[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="167" formatCode="0.0#"/><numFmt numFmtId="164" formatCode="${X(FMT_MONEY)}"/><numFmt numFmtId="165" formatCode="d mmm yyyy"/><numFmt numFmtId="166" formatCode="0%"/></numFmts>
<fonts count="10">
<font><sz val="10"/><color rgb="FF1F2622"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="20"/><color rgb="FF1F2622"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF66706A"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><color rgb="FF1F2622"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF1F2622"/><name val="Arial"/><family val="2"/></font>
<font><sz val="9"/><color rgb="FF4D5751"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="13"/><color rgb="FF2F6B4F"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF2F6B4F"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FFB23A2E"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F6B4F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F5F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7EFEA"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6DC"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFDDE2DB"/></bottom><diagonal/></border>
<border><left/><right/><top style="medium"><color rgb="FF2F6B4F"/></top><bottom/><diagonal/></border>
<border><left/><right/><top style="thick"><color rgb="FF2F6B4F"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="26">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="bottom" wrapText="1" indent="1"/></xf>
<xf numFmtId="164" fontId="5" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="top" indent="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="bottom"/></xf>
<xf numFmtId="165" fontId="4" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="166" fontId="4" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="8" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="9" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="4" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="bottom" wrapText="1" indent="1"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="167" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="2"><dxf><font><b/><color rgb="FFB23A2E"/></font></dxf><dxf><font><color rgb="FF2F6B4F"/></font></dxf></dxfs>
</styleSheet>`;

/* ---------- sheet model ---------- */
class Sheet{
  constructor(name,o={}){Object.assign(this,{name,rows:{},cols:[],heights:{},merges:[],cf:[],charts:[],o})}
  set(r,c,v,s=0,f){(this.rows[r]||(this.rows[r]={}))[c]={v,s,f};return this}
  xml(drawingRid){
    const o=this.o;let rowsXml='';
    for(const r of Object.keys(this.rows).map(Number).sort((a,b)=>a-b)){
      const cells=this.rows[r],ht=this.heights[r];
      rowsXml+=`<row r="${r}"${ht?` ht="${ht}" customHeight="1"`:''}>`;
      for(const c of Object.keys(cells).map(Number).sort((a,b)=>a-b)){
        const{v,s,f}=cells[c],rf=ref(r,c),sa=s?` s="${s}"`:'';
        if(f){
          if(typeof v==='string') rowsXml+=`<c r="${rf}"${sa} t="str"><f>${X(f)}</f><v>${X(v)}</v></c>`;
          else rowsXml+=`<c r="${rf}"${sa}><f>${X(f)}</f>${v==null?'':`<v>${v}</v>`}</c>`;
        }else if(v==null||v==='') rowsXml+=`<c r="${rf}"${sa}/>`;
        else if(typeof v==='number') rowsXml+=`<c r="${rf}"${sa}><v>${isFinite(v)?v:0}</v></c>`;
        else rowsXml+=`<c r="${rf}"${sa} t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`;
      }
      rowsXml+='</row>';
    }
    const pane=o.freeze?`<pane ySplit="${o.freeze}" topLeftCell="A${o.freeze+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${o.freeze+1}" sqref="A${o.freeze+1}"/>`:'';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr>${o.tab?`<tabColor rgb="FF${o.tab}"/>`:''}<pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"${o.grid===false?' showGridLines="0"':''}${o.active?' tabSelected="1"':''}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${this.cols.length?`<cols>${this.cols.map((w,i)=>w?`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`:'').join('')}</cols>`:''}
<sheetData>${rowsXml}</sheetData>
${o.filter?`<autoFilter ref="${o.filter}"/>`:''}
${this.merges.length?`<mergeCells count="${this.merges.length}">${this.merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>`:''}
${this.cf.join('')}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="${o.landscape?'landscape':'portrait'}" fitToWidth="1" fitToHeight="0"/>
${drawingRid?`<drawing r:id="${drawingRid}"/>`:''}
</worksheet>`;
  }
}

/* ---------- charts ---------- */
const NS_C='xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const fill=hex=>`<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
const txt=(sz=900,color='4D5751',b=0)=>`<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
const title=t=>`<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="1F2622"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${X(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
const strRef=(f,vals)=>`<c:strRef><c:f>${X(f)}</c:f><c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v,i)=>`<c:pt idx="${i}"><c:v>${X(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`;
const numRef=(f,vals,fc='General')=>`<c:numRef><c:f>${X(f)}</c:f><c:numCache><c:formatCode>${X(fc)}</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v,i)=>v==null||v===''?'':`<c:pt idx="${i}"><c:v>${+v||0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
const wrapChart=(t,plot,legend)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace ${NS_C}><c:roundedCorners val="0"/><c:chart>${title(t)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea>${legend?`<c:legend><c:legendPos val="${legend}"/><c:overlay val="0"/>${txt(900)}</c:legend>`:''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt(900)}</c:chartSpace>`;
const lbls=(fmt,pos,show='val')=>`<c:dLbls><c:numFmt formatCode="${X(fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt(800,'1F2622')}${pos?`<c:dLblPos val="${pos}"/>`:''}<c:showLegendKey val="0"/><c:showVal val="${show==='val'?1:0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${show==='pct'?1:0}"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`;
const axes=(dir,showVal,vfmt=FMT_MONEY,cfmt='General')=>`<c:catAx><c:axId val="501"/><c:scaling><c:orientation val="${dir==='bar'?'maxMin':'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${dir==='bar'?'l':'b'}"/><c:numFmt formatCode="${X(cfmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C9D0C7"/></a:solidFill></a:ln></c:spPr>${txt(900,'1F2622')}<c:crossAx val="502"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="502"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${showVal?0:1}"/><c:axPos val="${dir==='bar'?'t':'l'}"/>${showVal?'<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E7E1"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>':''}<c:numFmt formatCode="${X(vfmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt(800)}<c:crossAx val="501"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
function barChart({t,dir='bar',series,cats,showVal=false,legend=null,gap=55}){
  const ser=series.map((s,i)=>`<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${strRef(s.nameRef,[s.name])}</c:tx>${fill(s.color)}<c:invertIfNegative val="0"/>
    ${(s.pointColors||[]).map((c,j)=>`<c:dPt><c:idx val="${j}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>${fill(c)}</c:dPt>`).join('')}
    ${s.labels?lbls(FMT_MONEY,'outEnd'):''}<c:cat>${strRef(cats.ref,cats.vals)}</c:cat><c:val>${numRef(s.ref,s.vals)}</c:val></c:ser>`).join('');
  return wrapChart(t,`<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="${gap}"/><c:overlap val="-10"/><c:axId val="501"/><c:axId val="502"/></c:barChart>${axes(dir,showVal)}`,legend);
}
function lineChart({t,series,cats,vfmt='0.0',legend=null}){
  const ser=series.map((s,i)=>`<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${strRef(s.nameRef,[s.name])}</c:tx>
    <c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:round/></a:ln></c:spPr>
    <c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>
    ${lbls(vfmt,'t')}<c:cat>${strRef(cats.ref,cats.vals)}</c:cat><c:val>${numRef(s.ref,s.vals)}</c:val><c:smooth val="0"/></c:ser>`).join('');
  return wrapChart(t,`<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="501"/><c:axId val="502"/></c:lineChart>${axes('col',true,vfmt)}`,legend);
}
function doughnut({t,ser,cats,colors}){
  return wrapChart(t,`<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx>${strRef(ser.nameRef,[ser.name])}</c:tx>
    ${cats.vals.map((_,j)=>`<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${colors[j%colors.length]}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('')}
    ${lbls('0%',null,'pct')}<c:cat>${strRef(cats.ref,cats.vals)}</c:cat><c:val>${numRef(ser.ref,ser.vals)}</c:val></c:ser><c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`,'r');
}
const drawingXml=anchors=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${anchors.map((a,i)=>`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${a.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${a.c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i+2}" name="Chart ${i+1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i+1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join('')}
</xdr:wsDr>`;

/* ---------- workbook ---------- */
const PALETTE=['2F6B4F','3B6EA5','C2912E','8E5A9B','4E9A9A','B4553F','6B8E23','A0526D','5C6B7A','D08A2E','7A8B3C','3F7F6E'];
function build(m){
  const sheets=[];
  /* Entries */
  const E=new Sheet('Entries',{freeze:1,tab:'3B6EA5',filter:`A1:J${Math.max(2,m.entries.length+1)}`,landscape:true});
  E.cols=[13,11,18,22,18,14,15,16,14,34];
  ['Date','Type','Category','Account','To / with','Amount (Rs)','My share (Rs)','Paid with','Group','Note'].forEach((h,c)=>E.set(1,c,h,c===5||c===6?ST.headR:ST.head));
  E.heights[1]=24;
  m.entries.forEach((e,i)=>{
    const r=i+2,b=i%2===1;
    E.set(r,0,serial(e.date),b?ST.dateB:ST.date).set(r,1,e.type,b?ST.textB:ST.text).set(r,2,e.cat||'',b?ST.textB:ST.text)
     .set(r,3,e.acc||'',b?ST.textB:ST.text).set(r,4,e.to||'',b?ST.textB:ST.text).set(r,5,e.amt,b?ST.moneyB:ST.money)
     .set(r,6,e.share==null?'':e.share,b?ST.moneyB:ST.money).set(r,7,e.method||'',b?ST.textB:ST.text).set(r,8,e.group||'',b?ST.textB:ST.text).set(r,9,e.note||'',b?ST.textB:ST.text);
  });
  const sumifs=(col,extra)=>`SUMIFS(Entries!$${col}:$${col},Entries!$B:$B,"Expense",Entries!$A:$A,">="&$B$4,Entries!$A:$A,"<="&$D$4${extra||''})`;

  /* Summary */
  const S=new Sheet('Summary',{grid:false,tab:'2F6B4F',active:true});
  S.cols=[24,16,16,16,16,16];
  S.set(1,0,'Khata',ST.title);S.heights[1]=30;
  S.set(2,0,`Your money, exported ${m.exportedLabel}. Totals below recalculate if you change the dates.`,ST.sub);
  S.set(4,0,'Period',ST.totL).set(4,1,serial(m.periodStart),ST.input).set(4,2,'to',ST.sub).set(4,3,serial(m.periodEnd),ST.input);
  const spentCached=m.cats.reduce((s,c)=>s+c.spent,0);
  const kpis=[
    ['Spent',spentCached,sumifs('G')],
    ...(m.noIncome?[['Average a day',m.perDay,`IFERROR(A7/(MIN($D$4,TODAY())-$B$4+1),0)`]]:[
    ['Income',m.income,`SUMIFS(Entries!$F:$F,Entries!$B:$B,"Income",Entries!$A:$A,">="&$B$4,Entries!$A:$A,"<="&$D$4)`],
    ['Saved (income minus spent)',m.income-spentCached,'B7-A7']]),
    m.cats.length&&m.cats.some(c=>c.budget)?['Budget left this period',m.cats.reduce((s,c)=>s+(c.budget||0),0)-spentCached,`B${11+m.cats.length}-C${11+m.cats.length}`]:['Budget left this period','No budgets set',null],
    ['Owed on cards',m.owe,`SUMIFS(Accounts!$E:$E,Accounts!$C:$C,"Credit")`],
    ['Friends owe you (minus = you owe)',m.friends,`SUMIFS(Groups!$F:$F,Groups!$B:$B,"You")`]
  ];
  kpis.forEach(([l,v,f],c)=>{S.set(6,c,l,ST.kpiTop);S.set(7,c,v,typeof v==='string'?ST.kpiL:ST.kpiV,f||undefined)});
  S.heights[6]=30;S.heights[7]=30;
  let r=9;
  S.set(r,0,'Where your money went',ST.sect);S.heights[r]=24;r++;
  const hr=r;['Category','Budget','Spent','Left','Used'].forEach((h,c)=>S.set(r,c,h,c?ST.headR:ST.head));S.heights[r]=22;r++;
  const c0=r;
  m.cats.forEach((c,i)=>{
    const b=i%2===1;
    S.set(r,0,c.name,b?ST.textB:ST.text).set(r,1,c.budget||'',b?ST.moneyB:ST.money)
     .set(r,2,c.spent,b?ST.moneyB:ST.money,`${sumifs('G',`,Entries!$C:$C,$A${r}`)}`)
     .set(r,3,c.budget?c.budget-c.spent:'',b?ST.moneyB:ST.money,`IF(B${r}>0,B${r}-C${r},"")`)
     .set(r,4,c.budget?c.spent/c.budget:'',b?ST.pctB:ST.pct,`IF(B${r}>0,C${r}/B${r},"")`);
    r++;
  });
  const c1=r-1;
  if(m.cats.length){
    S.cf.push(`<conditionalFormatting sqref="E${c0}:E${c1}"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>1</formula></cfRule></conditionalFormatting>`);
    S.cf.push(`<conditionalFormatting sqref="D${c0}:D${c1}"><cfRule type="cellIs" dxfId="0" priority="2" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting>`);
  }
  const tb=m.cats.reduce((s,c)=>s+(c.budget||0),0);
  if(m.cats.length) S.set(r,0,'Total',ST.totL).set(r,1,tb,ST.totM,`SUM(B${c0}:B${c1})`).set(r,2,spentCached,ST.totM,`SUM(C${c0}:C${c1})`).set(r,3,'',ST.totM).set(r,4,'',ST.totP);
  else S.set(r,0,'No spending in this period yet.',ST.sub);
  r+=2;
  if(m.cats.length){
    S.charts.push({r1:r-1,r2:r-1+Math.max(12,m.cats.length+5),c1:0,c2:6,xml:barChart({t:'Spending by category',dir:'bar',gap:45,
      series:[{name:'Spent',nameRef:`Summary!$C$${hr}`,ref:`Summary!$C$${c0}:$C$${c1}`,vals:m.cats.map(c=>c.spent),color:'2F6B4F',pointColors:m.cats.map(c=>c.color.replace('#','')),labels:true}],
      cats:{ref:`Summary!$A$${c0}:$A$${c1}`,vals:m.cats.map(c=>c.name)}})});
    r+=Math.max(12,m.cats.length+5)+1;
  }
  S.set(r,0,'How you paid',ST.sect);S.heights[r]=24;r++;
  const mh=r;['Paid with','Spent','Share'].forEach((h,c)=>S.set(r,c,h,c?ST.headR:ST.head));r++;
  const m0=r;
  m.methods.forEach((x,i)=>{const b=i%2===1;
    S.set(r,0,x.name,b?ST.textB:ST.text).set(r,1,x.spent,b?ST.moneyB:ST.money,sumifs('G',`,Entries!$H:$H,$A${r}`))
     .set(r,2,spentCached?x.spent/spentCached:0,b?ST.pctB:ST.pct,`IF($C$${hr+m.cats.length+1}>0,B${r}/$C$${hr+m.cats.length+1},0)`);r++});
  const m1=r-1;r++;
  if(m.methods.length){
    S.charts.push({r1:r-1,r2:r+13,c1:0,c2:4,xml:doughnut({t:'Payment methods',ser:{name:'Spent',nameRef:`Summary!$B$${mh}`,ref:`Summary!$B$${m0}:$B$${m1}`,vals:m.methods.map(x=>x.spent)},
      cats:{ref:`Summary!$A$${m0}:$A$${m1}`,vals:m.methods.map(x=>x.name)},colors:PALETTE})});
    r+=15;
  }
  S.set(r,0,'Last 12 months',ST.sect);S.heights[r]=24;r++;
  S.set(r,0,'From the Monthly sheet.',ST.sub);r++;
  S.charts.push({r1:r-1,r2:r+15,c1:0,c2:6,xml:barChart({t:m.noIncome?'Spent by month':'Spent and income by month',dir:'col',showVal:true,legend:m.noIncome?null:'b',gap:80,
    series:[{name:'Spent',nameRef:'Monthly!$D$1',ref:`Monthly!$D$2:$D$${m.months.length+1}`,vals:m.months.map(x=>x.spent),color:'2F6B4F'},
            ...(m.noIncome?[]:[{name:'Income',nameRef:'Monthly!$E$1',ref:`Monthly!$E$2:$E$${m.months.length+1}`,vals:m.months.map(x=>x.income),color:'C2912E'}])],
    cats:{ref:`Monthly!$A$2:$A$${m.months.length+1}`,vals:m.months.map(x=>x.label)}})});

  /* Monthly */
  const M=new Sheet('Monthly',{freeze:1,tab:'C2912E'});
  M.cols=[14,13,13,15,15,15];
  (m.noIncome?['Month','From','To','Spent (Rs)']:['Month','From','To','Spent (Rs)','Income (Rs)','Saved (Rs)']).forEach((h,c)=>M.set(1,c,h,c>2?ST.headR:ST.head));M.heights[1]=24;
  m.months.forEach((x,i)=>{const rr=i+2,b=i%2===1;
    M.set(rr,0,x.label,b?ST.textB:ST.text).set(rr,1,serial(x.start),b?ST.dateB:ST.date).set(rr,2,serial(x.end),b?ST.dateB:ST.date)
     .set(rr,3,x.spent,b?ST.moneyB:ST.money,`SUMIFS(Entries!$G:$G,Entries!$B:$B,"Expense",Entries!$A:$A,">="&B${rr},Entries!$A:$A,"<="&C${rr})`)
    if(!m.noIncome) M.set(rr,4,x.income,b?ST.moneyB:ST.money,`SUMIFS(Entries!$F:$F,Entries!$B:$B,"Income",Entries!$A:$A,">="&B${rr},Entries!$A:$A,"<="&C${rr})`)
     .set(rr,5,x.income-x.spent,b?ST.moneyB:ST.money,`E${rr}-D${rr}`)});
  const mt=m.months.length+2;
  M.set(mt,0,'Total',ST.totL).set(mt,1,'',ST.totL).set(mt,2,'',ST.totL)
   .set(mt,3,m.months.reduce((s,x)=>s+x.spent,0),ST.totM,`SUM(D2:D${mt-1})`);
  if(!m.noIncome){M.set(mt,4,m.months.reduce((s,x)=>s+x.income,0),ST.totM,`SUM(E2:E${mt-1})`).set(mt,5,m.months.reduce((s,x)=>s+x.income-x.spent,0),ST.totM,`SUM(F2:F${mt-1})`);
  M.cf.push(`<conditionalFormatting sqref="F2:F${mt}"><cfRule type="cellIs" dxfId="0" priority="1" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting>`);}

  /* Accounts */
  const Ac=new Sheet('Accounts',{freeze:1,tab:'8E5A9B'});
  Ac.cols=[26,22,10,15,15,15,13,14];
  ['Account','Type','Kind','Credit limit','Owed (Rs)','Available','Statement day','Pay by'].forEach((h,c)=>Ac.set(1,c,h,c>=3&&c<=5?ST.headR:ST.head));Ac.heights[1]=24;
  m.accounts.forEach((a,i)=>{const rr=i+2,b=i%2===1,T=b?ST.textB:ST.text,Mo=b?ST.moneyB:ST.money,cr=a.kind==='Credit';
    Ac.set(rr,0,a.name,T).set(rr,1,a.type,T).set(rr,2,a.kind,T).set(rr,3,cr&&a.limit?a.limit:'',Mo).set(rr,4,cr?a.owed:'',Mo)
      .set(rr,5,cr&&a.limit?a.limit-a.owed:'',Mo,cr&&a.limit?`D${rr}-E${rr}`:undefined).set(rr,6,a.stmtDay||'',T).set(rr,7,a.payBy||'',T)});
  const at=m.accounts.length+2;
  Ac.set(at,0,'Owed on cards',ST.totL).set(at,4,m.owe,ST.totM,`SUMIFS(E2:E${at-1},C2:C${at-1},"Credit")`);
  Ac.set(at+2,0,'Bank, wallet and cash balances are left out of this file on purpose. They stay in the app and in the encrypted backup file.',ST.note);
  /* Groups */
  const G=new Sheet('Groups',{freeze:1,tab:'B4553F'});
  G.cols=[20,18,15,15,15,15];
  ['Group','Person','Paid for bills','Their share','Settled (sent minus received)','Balance (+ is owed)'].forEach((h,c)=>G.set(1,c,h,c>=2?ST.headR:ST.head));G.heights[1]=30;
  let gr=2;
  m.groups.forEach(g=>g.rows.forEach((p,i)=>{const b=i%2===1,T=b?ST.textB:ST.text,Mo=b?ST.moneyB:ST.money,bal=p.paid-p.share+p.settled;
    G.set(gr,0,g.name,T).set(gr,1,p.person,T).set(gr,2,p.paid,Mo).set(gr,3,p.share,Mo).set(gr,4,p.settled,Mo)
     .set(gr,5,bal,bal<0?ST.moneyR:bal>0?ST.moneyG:Mo,`C${gr}-D${gr}+E${gr}`);gr++}));
  gr+=1;G.set(gr,0,'To settle up',ST.sect);gr++;
  ['Group','Who pays','Who gets','Amount (Rs)'].forEach((h,c)=>G.set(gr,c,h,c===3?ST.headR:ST.head));gr++;
  const anySettle=m.groups.some(g=>g.settle.length);
  m.groups.forEach(g=>g.settle.forEach((s,i)=>{const T=i%2?ST.textB:ST.text;G.set(gr,0,g.name,T).set(gr,1,s.from,T).set(gr,2,s.to,T).set(gr,3,s.amt,i%2?ST.moneyB:ST.money);gr++}));
  if(!anySettle){G.set(gr,0,'Everyone is settled up.',ST.sub);gr++}

  /* Vehicles */
  const veh=m.vehicles||[];
  if(veh.length){
    const F=new Sheet('Fuel',{freeze:1,tab:'4E9A9A'});
    F.cols=[16,13,12,10,12,13,14,13,30,11];
    ['Vehicle','Date','ODO (km)','Litres','Rate (Rs/L)','Total (Rs)','Km since last fill','Km per litre','Note','Label'].forEach((h,c)=>F.set(1,c,h,c>=2&&c<=7?ST.headR:ST.head));F.heights[1]=30;
    const fuel=m.fuel||[];
    fuel.forEach((f,i)=>{const r=i+2,b=i%2===1,T=b?ST.textB:ST.text,Mo=b?ST.moneyB:ST.money,N=b?ST.num1B:ST.num1;
      const prev=fuel[i-1],km=prev&&prev.veh===f.veh&&f.odo!=null&&prev.odo!=null?f.odo-prev.odo:'';
      F.set(r,0,f.veh,T).set(r,1,serial(f.date),b?ST.dateB:ST.date).set(r,2,f.odo??'',Mo).set(r,3,f.litres??'',N).set(r,4,f.rate??'',Mo).set(r,5,f.total??'',Mo)
       .set(r,6,km,Mo,`IF(AND(A${r}=A${r-1},ISNUMBER(C${r}),ISNUMBER(C${r-1})),C${r}-C${r-1},"")`)
       .set(r,7,km!==''&&f.litres?km/f.litres:'',N,`IF(AND(ISNUMBER(G${r}),N(D${r})>0),G${r}/D${r},"")`).set(r,8,f.note||'',T).set(r,9,f.label,T)});
    const V=new Sheet('Vehicles',{grid:false,tab:'4E9A9A'});
    V.cols=[18,15,13,13,15,15,13];
    V.set(1,0,'Vehicles',ST.title);V.heights[1]=30;V.set(2,0,'Mileage uses fill-to-fill distance. The first fill of each vehicle only sets the starting point.',ST.sub);
    ['Vehicle','Distance tracked (km)','Litres','Avg km per litre','Fuel spent (Rs)','Service and other (Rs)','Fuel Rs per km'].forEach((h,c)=>V.set(4,c,h,c?ST.headR:ST.head));V.heights[4]=30;
    veh.forEach((v,i)=>{const r=i+5,b=i%2===1,T=b?ST.textB:ST.text,Mo=b?ST.moneyB:ST.money,N=b?ST.num1B:ST.num1;
      V.set(r,0,v.name,T).set(r,1,v.km,Mo,`SUMIFS(Fuel!$G:$G,Fuel!$A:$A,$A${r})`).set(r,2,v.litres,N,`SUMIFS(Fuel!$D:$D,Fuel!$A:$A,$A${r},Fuel!$G:$G,">0")`)
       .set(r,3,v.litres?v.km/v.litres:'',N,`IF(C${r}>0,B${r}/C${r},"")`).set(r,4,v.fuelSpent,Mo,`SUMIFS(Fuel!$F:$F,Fuel!$A:$A,$A${r})`)
       .set(r,5,v.serviceSpent,Mo,`SUMIFS(Service!$E:$E,Service!$A:$A,$A${r})`).set(r,6,v.km?v.fuelCostKm/v.km:'',N,`IF(B${r}>0,SUMIFS(Fuel!$F:$F,Fuel!$A:$A,$A${r},Fuel!$G:$G,">0")/B${r},"")`)});
    let vr=veh.length+7;
    const main=veh[0],rows=fuel.map((f,i)=>({f,r:i+2})).filter(x=>x.f.veh===main.name);
    if(rows.length>1){
      const r0=rows[0].r,r1=rows[rows.length-1].r;
      V.charts.push({r1:vr,r2:vr+16,c1:0,c2:7,xml:lineChart({t:`${main.name}: km per litre, fill by fill`,vfmt:'0.0',
        series:[{name:'Km per litre',nameRef:'Fuel!$H$1',ref:`Fuel!$H$${r0+1}:$H$${r1}`,vals:rows.slice(1).map(x=>x.f.kml??null),color:'2F6B4F'}],cats:{ref:`Fuel!$J$${r0+1}:$J$${r1}`,vals:rows.slice(1).map(x=>x.f.label)}})});
      vr+=18;
      V.charts.push({r1:vr,r2:vr+16,c1:0,c2:7,xml:lineChart({t:'Petrol rate (Rs per litre)',vfmt:'0',
        series:[{name:'Rate',nameRef:'Fuel!$E$1',ref:`Fuel!$E$${r0}:$E$${r1}`,vals:rows.map(x=>x.f.rate),color:'C2912E'}],cats:{ref:`Fuel!$J$${r0}:$J$${r1}`,vals:rows.map(x=>x.f.label)}})});
    }
    const Sv=new Sheet('Service',{freeze:1,tab:'4E9A9A'});
    Sv.cols=[16,13,12,14,13,12,36];
    ['Vehicle','Date','ODO (km)','Type','Cost (Rs)','Service no.','Note'].forEach((h,c)=>Sv.set(1,c,h,c===2||c===4?ST.headR:ST.head));Sv.heights[1]=24;
    (m.service||[]).forEach((x,i)=>{const r=i+2,b=i%2===1,T=b?ST.textB:ST.text,Mo=b?ST.moneyB:ST.money;
      Sv.set(r,0,x.veh,T).set(r,1,serial(x.date),b?ST.dateB:ST.date).set(r,2,x.odo??'',Mo).set(r,3,x.type,T).set(r,4,x.cost??'',Mo).set(r,5,x.no||'',T).set(r,6,x.note||'',T)});
    sheets.push(V,F,Sv);
  }

  /* Backup (hidden) */
  const B=new Sheet('_khata',{});
  B.set(1,0,'Khata uses this sheet to restore your data. Leave it unchanged.');
  const json=m.backup;for(let i=0,rr=2;i<json.length;i+=30000,rr++) B.set(rr,0,json.slice(i,i+30000));

  sheets.unshift(S,E,M,Ac,G);sheets.push(B);

  /* package */
  const files=[],ct=[],wbRels=[];
  let chartN=0,drawN=0;
  sheets.forEach((sh,i)=>{
    const n=i+1;let rid=null;
    if(sh.charts.length){
      drawN++;rid='rId1';
      const drels=sh.charts.map((c,j)=>{chartN++;files.push({name:`xl/charts/chart${chartN}.xml`,data:c.xml});ct.push(`<Override PartName="/xl/charts/chart${chartN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        return `<Relationship Id="rId${j+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartN}.xml"/>`});
      files.push({name:`xl/drawings/drawing${drawN}.xml`,data:drawingXml(sh.charts)});
      files.push({name:`xl/drawings/_rels/drawing${drawN}.xml.rels`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drels.join('')}</Relationships>`});
      ct.push(`<Override PartName="/xl/drawings/drawing${drawN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      files.push({name:`xl/worksheets/_rels/sheet${n}.xml.rels`,data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawN}.xml"/></Relationships>`});
    }
    files.push({name:`xl/worksheets/sheet${n}.xml`,data:sh.xml(rid)});
    ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    wbRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
  });
  const sid=sheets.length+1;
  wbRels.push(`<Relationship Id="rId${sid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  const eIdx=sheets.indexOf(E);
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>${sheets.map((sh,i)=>`<sheet name="${X(sh.name)}" sheetId="${i+1}"${sh.name==='_khata'?' state="hidden"':''} r:id="rId${i+1}"/>`).join('')}</sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${eIdx}" hidden="1">Entries!$A$1:$J$${Math.max(2,m.entries.length+1)}</definedName></definedNames>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`;
  files.unshift(
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${ct.join('')}</Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`},
    {name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Khata export</dc:title><dc:creator>Khata</dc:creator></cp:coreProperties>`},
    {name:'docProps/app.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Khata</Application></Properties>`},
    {name:'xl/workbook.xml',data:workbook},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`},
    {name:'xl/styles.xml',data:STYLES}
  );
  return zip(files);
}

/* ---------- restore ---------- */
async function readBackup(buf,parseXml){
  const z=await unzip(buf);
  const wb=parseXml(await z.text('xl/workbook.xml'));
  const sh=[...wb.getElementsByTagName('sheet')].find(s=>s.getAttribute('name')==='_khata');
  if(!sh) throw new Error('This Excel file has no Khata backup sheet.');
  const rid=sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const rels=parseXml(await z.text('xl/_rels/workbook.xml.rels'));
  let target=[...rels.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===rid).getAttribute('Target');
  target=target.replace(/^\/?xl\//,'').replace(/^\//,'');
  const sheet=parseXml(await z.text('xl/'+target));
  let shared=[];
  const sst=await z.text('xl/sharedStrings.xml');
  if(sst) shared=[...parseXml(sst).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join(''));
  const chunks=[];
  for(const c of sheet.getElementsByTagName('c')){
    const r=c.getAttribute('r');const m=/^A(\d+)$/.exec(r);if(!m||+m[1]<2) continue;
    const t=c.getAttribute('t');let val;
    if(t==='s') val=shared[+c.getElementsByTagName('v')[0].textContent];
    else if(t==='inlineStr') val=[...c.getElementsByTagName('t')].map(x=>x.textContent).join('');
    else val=(c.getElementsByTagName('v')[0]||{}).textContent;
    chunks[+m[1]]=val||'';
  }
  return JSON.parse(chunks.filter(x=>x!=null).join(''));
}

root.KhataXlsx={build,readBackup,unzip,PALETTE};
})(typeof window!=='undefined'?window:globalThis);
