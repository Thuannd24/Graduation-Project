import React, { useState, useEffect, useRef, useCallback } from "react";
import { campaignApi } from "../../../services/campaignApi.ts";
import "./campaign-builder.css";

const NODE_TYPES = {
  Trigger_Event_NewUser:{cat:"trigger",name:"Đăng ký mới",icon:"👤",color:"#0ea5e9",def:{}},
  Trigger_Event_OrderSuccess:{cat:"trigger",name:"Mua hàng thành công",icon:"🛒",color:"#0ea5e9",def:{minOrderValue:100000}},
  Trigger_Event_ReviewProduct:{cat:"trigger",name:"Đánh giá sản phẩm",icon:"⭐",color:"#0ea5e9",def:{minRating:5}},
  Trigger_Timer_Schedule:{cat:"trigger",name:"Hẹn giờ định kỳ",icon:"⏰",color:"#0ea5e9",def:{cronExpression:"0 0 12 * * ?"}},
  Condition_MemberRank:{cat:"condition",name:"Hạng thành viên",icon:"👑",color:"#f59e0b",def:{allowedRanks:["GOLD","VIP"]}},
  Condition_TotalSpending:{cat:"condition",name:"Tổng chi tiêu tháng",icon:"💰",color:"#f59e0b",def:{minSpendingAmount:5000000,daysLookback:30}},
  Condition_Location:{cat:"condition",name:"Khu vực địa lý",icon:"📍",color:"#f59e0b",def:{targetProvinces:[]}},
  Condition_ContainsCategory:{cat:"condition",name:"Danh mục giỏ hàng",icon:"🏷️",color:"#f59e0b",def:{targetIds:[]}},
  Condition_ContainsProduct:{cat:"condition",name:"Sản phẩm giỏ hàng",icon:"📦",color:"#f59e0b",def:{targetIds:[]}},
  Condition_AntiFraudScore:{cat:"condition",name:"Chống gian lận",icon:"🛡️",color:"#f59e0b",def:{maxRiskScore:50}},
  Action_IssueVoucher_Percent:{cat:"action",name:"Voucher theo %",icon:"🎟️",color:"#10b981",def:{discountPercent:10,maxDiscountAmount:50000,expireDays:7}},
  Action_IssueVoucher_Fixed:{cat:"action",name:"Voucher tiền cố định",icon:"💵",color:"#10b981",def:{discountAmount:20000,minOrderValue:150000,expireDays:7}},
  Action_IssueVoucher_Freeship:{cat:"action",name:"Voucher Freeship",icon:"🚚",color:"#10b981",def:{maxShippingDiscount:30000,expireDays:7}},
  Action_Upgrade_MemberRank:{cat:"action",name:"Nâng hạng hội viên",icon:"📈",color:"#10b981",def:{targetTier:"GOLD"}},
  Action_Loyalty_Point:{cat:"action",name:"Điểm thưởng tích lũy",icon:"💎",color:"#10b981",def:{pointAmount:100,calculationMode:"FIXED"}},
  Action_Send_Email:{cat:"action",name:"Gửi Email",icon:"✉️",color:"#10b981",def:{templateId:"",rawContent:""}},
};

const CAT_NAMES = {trigger:"Sự Kiện Kích Hoạt (Trigger)",condition:"Điều Kiện Phân Nhánh",action:"Hành Động Nhận Thưởng"};
const CAT_DOTS = {trigger:"cb-dot-trigger",condition:"cb-dot-condition",action:"cb-dot-action"};
const CAT_KEYS = ["trigger","condition","action"];

function co(o){return JSON.parse(JSON.stringify(o));}

function getLevels(nodes, edges) {
  const lv = {}; const visited = new Set(); const q = ["start"]; lv["start"] = 0;
  while (q.length) { const c = q.shift(); const cl = lv[c]||0;
    edges.filter(e=>e.source===c).forEach(e => { lv[e.target] = Math.max(lv[e.target]||0, cl+1); if (!visited.has(e.target)) q.push(e.target); });
    visited.add(c); }
  nodes.forEach(n => { if (lv[n.id]===undefined) lv[n.id]=1; });
  lv["end"] = Math.max(...Object.values(lv).filter(x=>x!==lv["end"]),0)+1;
  return lv;
}

function computeLayout(nodes, edges) {
  const levels = getLevels(nodes, edges);
  const cols = {}; const occupied = {};
  function occupy(id, lvl, pref) {
    let col = pref, step = 1, dir = 1;
    while (occupied[lvl+"_"+col] && occupied[lvl+"_"+col]!==id) { col = pref + dir*step; dir*=-1; if (dir===1) step++; }
    cols[id] = col; occupied[lvl+"_"+col] = id;
  }
  occupy("start", 0, 0);
  const visited = new Set(); const queue = ["start"];
  while (queue.length) {
    const curr = queue.shift(); if (visited.has(curr)) continue; visited.add(curr);
    const cc = cols[curr]||0; const cl = levels[curr]||0;
    const out = edges.filter(e=>e.source===curr);
    if (!out.length) continue;
    const sorted = [...out].sort((a,b)=>(a.isDefault?1:0)-(b.isDefault?1:0));
    if (sorted.length===1) {
      const t = sorted[0].target; const tl = levels[t]||(cl+1);
      if (cols[t]===undefined) occupy(t, tl, t==="end"?0:cc);
      queue.push(t);
    } else {
      const nonDef = sorted.filter(e=>!e.isDefault);
      const spacing = 2 * Math.max(1, Math.ceil(sorted.length/2));
      sorted.forEach((e,idx) => {
        const t = e.target; const tl = levels[t]||(cl+1);
        if (cols[t]!==undefined) { queue.push(t); return; }
        if (t==="end") { occupy(t, tl, 0); queue.push(t); return; }
        if (e.isDefault) { occupy(t, tl, cc); }
        else {
          const ndIdx = nonDef.findIndex(x=>x.id===e.id);
          const total = nonDef.length;
          let offset;
          if (total===1) offset = -spacing;
          else if (total===2) offset = ndIdx===0 ? -spacing : spacing;
          else offset = ndIdx%2===0 ? -spacing*(Math.floor(ndIdx/2)+1) : spacing*Math.ceil(ndIdx/2);
          occupy(t, tl, cc+offset);
        }
        queue.push(t);
      });
    }
  }
  if (cols["end"]===undefined) cols["end"]=0;
  nodes.forEach(n => { if (cols[n.id]===undefined) occupy(n.id, levels[n.id]||1, 0); });
  return { levels, columns:cols };
}

function buildGraphPayload(nodes, edges) {
  return { nodes: nodes.map(n=>({id:n.id,name:n.name,type:n.type,properties:n.properties})),
    edges: edges.map(e=>({id:e.id,source:e.source,target:e.target,from:e.source,to:e.target,condition:e.properties?.expression||"",isDefault:e.isDefault,properties:e.properties||{}})) };
}

function es(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function gdc(t) {
  const m = {Action_IssueVoucher_Percent:"issueVoucherPercentDelegate",Action_IssueVoucher_Fixed:"issueVoucherFixedDelegate",
    Action_IssueVoucher_Freeship:"issueVoucherFreeshippingDelegate",Action_Upgrade_MemberRank:"upgradeMemberRankDelegate",
    Action_Loyalty_Point:"loyaltyPointDelegate",Action_Send_Email:"sendNotificationDelegate"};
  return m[t]||"defaultDelegate";
}

function generateBPMNXML(nodes, edges) {
  const pk = "preview_"+Date.now();
  let x = '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_'+pk+'" targetNamespace="http://bpmn.io/schema/bpmn" exporter="CampaignBuilder" exporterVersion="2.0">\n  <bpmn:process id="'+pk+'" name="Workflow Preview" isExecutable="true">\n';
  nodes.forEach(n => {
    const m = NODE_TYPES[n.type];
    const inc = edges.filter(e=>e.target===n.id).map(e=>'      <bpmn:incoming>'+e.id+'</bpmn:incoming>').join("\n");
    const out = edges.filter(e=>e.source===n.id).map(e=>'      <bpmn:outgoing>'+e.id+'</bpmn:outgoing>').join("\n");
    if (n.id==="start") x += '    <bpmn:startEvent id="'+n.id+'" name="'+es(n.name)+'">\n'+out+'\n    </bpmn:startEvent>\n\n';
    else if (n.id==="end") x += '    <bpmn:endEvent id="'+n.id+'" name="'+es(n.name)+'">\n'+inc+'\n    </bpmn:endEvent>\n\n';
    else if (m?.cat==="condition") x += '    <bpmn:exclusiveGateway id="'+n.id+'" name="'+es(n.name)+'">\n'+inc+'\n'+out+'\n    </bpmn:exclusiveGateway>\n\n';
    else {
      const dc = gdc(n.type);
      const props = Object.entries(n.properties||{}).map(([k,v])=>'          <camunda:inputParameter name="'+k+'">'+es(String(v))+'</camunda:inputParameter>').join("\n");
      x += '    <bpmn:serviceTask id="'+n.id+'" name="'+es(n.name)+'" camunda:delegateExpression="\x24{'+dc+'}">\n'+inc+'\n'+out+'\n      <bpmn:extensionElements>\n        <camunda:inputOutput>\n'+props+'\n        </camunda:inputOutput>\n      </bpmn:extensionElements>\n    </bpmn:serviceTask>\n\n';
    }
  });
  edges.forEach(e => {
    const sn = nodes.find(n=>n.id===e.source); const isC = sn && NODE_TYPES[sn.type]?.cat==="condition";
    let expr = ""; if (isC && !e.isDefault && e.properties?.expression) expr = '\n      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">'+es(e.properties.expression)+'</bpmn:conditionExpression>';
    x += '    <bpmn:sequenceFlow id="'+e.id+'" sourceRef="'+e.source+'" targetRef="'+e.target+'"'+(e.isDefault?' default="true"':"")+'>'+expr+'\n    </bpmn:sequenceFlow>\n\n';
  });
  return x;
}

function pe(nodeType, expr) {
  if (!expr) return {};
  if (nodeType==="Condition_MemberRank") { const m = expr.match(/\x24\{memberRank\s*==\s*['"]([^'"]+)['"]\}/); return {rank:m?m[1]:"GOLD"}; }
  if (nodeType==="Condition_TotalSpending") { const m = expr.match(/\x24\{totalSpending\s*(>=|<=|>|<|==)\s*(\d+)\}/); return {operator:m?m[1]:">=",amount:m?Number(m[2]):5000000}; }
  if (nodeType==="Condition_AntiFraudScore") { const m = expr.match(/\x24\{antiFraudScore\s*(>=|<=|>|<|==)\s*(\d+)\}/); return {operator:m?m[1]:"<=",score:m?Number(m[2]):50}; }
  if (nodeType==="Condition_Location") { const m = expr.match(/\x24\{targetProvince\s*==\s*['"]([^'"]+)['"]\}/); return {value:m?m[1]:"Hanoi"}; }
  return {raw:expr};
}

function fx(xml) {
  const P = "  "; let f = "", p = 0;
  xml = xml.replace(/(>)(<)(\/*)/g,"$1\n$2$3");
  xml.split("\n").forEach(line => {
    let i = 0;
    if (line.match(/.+<\/\w[^>]*>$/)) i=0;
    else if (line.match(/^<\/\w/)) { if (p!==0) p--; }
    else if (line.match(/^<\w([^>]*[^\/])?>.*$/)) i=1;
    f += P.repeat(p)+line+"\n"; p+=i;
  });
  return f.trim();
}

function bEP(sx,sy,ex,ey,isC) {
  if (Math.abs(sx-ex)<15) return "M "+sx+" "+sy+" L "+ex+" "+ey;
  if (isC) { const h = sy+15; return "M "+sx+" "+sy+" L "+sx+" "+h+" L "+ex+" "+h+" L "+ex+" "+ey; }
  const my = (sy+ey)/2;
  return "M "+sx+" "+sy+" L "+sx+" "+my+" L "+ex+" "+my+" L "+ex+" "+ey;
}

var nc = 1;

export default function CampaignsTab() {
  const[vw,setVw] = useState("list"),[camps,setCamps] = useState([]),[load,setLoad] = useState(false);
  const[nd,setNd] = useState([{id:"start",name:"Bắt đầu",type:"Trigger_Event_NewUser",properties:{}},{id:"end",name:"Kết thúc",type:"End_Event",properties:{}}]);
  const[ed,setEd] = useState([{id:"e_se",source:"start",target:"end",isDefault:false,properties:{}}]);
  const[sel,setSel] = useState(null),[tab,setTab] = useState("editor"),[sD,setSD] = useState(false),[sV,setSV] = useState(false),[vR,setVR] = useState(null);
  const[dF,setDF] = useState({name:"",bpmnKey:"",budget:"",startDate:"",endDate:""}),[dT,setDT] = useState(null),[rI,setRI] = useState(null),[rV,setRV] = useState("");
  const[tt,setTt] = useState(null),[aIE,setAIE] = useState(null);
  const cv = useRef(null), ttr = useRef(null);

  const st = useCallback((m,t="info")=>{if(ttr.current)clearTimeout(ttr.current);setTt({msg:m,type:t});ttr.current=setTimeout(()=>setTt(null),3500)},[]);
  const fc = useCallback(async()=>{try{setLoad(true);const d=await campaignApi.listCampaigns();setCamps(Array.isArray(d)?[...d].sort((a,b)=>Number(b.id||0)-Number(a.id||0)):[])}catch(e){console.warn(e)}finally{setLoad(false)}},[]);
  useEffect(()=>{fc()},[fc]);

  const sN = nd.find(n=>n.id===sel), lay = computeLayout(nd,ed), lvs = lay.levels, cols = lay.columns;
  const cL = Object.values(cols), mn = Math.min(...cL,-1), mx = Math.max(...cL,1), mL = Math.max(...Object.values(lvs),0);
  const rw = Array.from({length:mL+1},()=>[]); nd.forEach(n=>{const l=lvs[n.id]||0;rw[l].push(n)});

  const aN = (type)=>{
    const m = NODE_TYPES[type]||{name:type,icon:"📦",color:"#6b7280"};
    const id = "n"+Date.now()+"_"+nc++; const p = (sel&&sel!=="end")?sel:"start";
    setNd(prev=>{const f=prev.filter(n=>n.id!=="end");return[...f,{id,name:m.name,type,properties:co(m.def||{})},prev.find(n=>n.id==="end")].filter(Boolean)});
    setEd(prev=>{const k=prev.filter(e=>e.source!==p||e.target==="end");return[...k.filter(e=>e.source!==p),{id:"e_"+id,source:p,target:id,isDefault:false,properties:{}},{id:"e_"+id+"_end",source:id,target:"end",isDefault:false,properties:{}}]});
    setSel(id); st("Đã thêm: "+m.name,"success");
  };

  const dN = ()=>{
    if(!sel||sel==="start"||sel==="end")return;
    const inc = ed.find(e=>e.target===sel), out = ed.filter(e=>e.source===sel);
    setNd(prev=>prev.filter(n=>n.id!==sel));
    setEd(prev=>{let nx=prev.filter(e=>e.source!==sel&&e.target!==sel);
      if(inc&&out.length>0){const s=inc.source;
        if(out.length===1){const t=out[0].target;if(!nx.some(e=>e.source===s&&e.target===t))nx.push({id:"e_"+s+"_to_"+t,source:s,target:t,isDefault:inc.isDefault,properties:co(inc.properties||{})})}
        else{const d=out.find(e=>e.isDefault)||out[0];if(!nx.some(e=>e.source===s&&e.target===d.target))nx.push({id:"e_"+s+"_to_"+d.target,source:s,target:d.target,isDefault:inc.isDefault,properties:{}})}}
      return nx});
    setSel(null); st("Đã xóa khối","info");
  };

  const iNE = (edgeId,type)=>{
    const m = NODE_TYPES[type]; if(!m||m.cat==="trigger"){st("Không thể chèn trigger vào giữa sơ đồ","error");return;}
    const ei = ed.findIndex(e=>e.id===edgeId); if(ei===-1)return;
    const eg = ed[ei], id = "n"+Date.now()+"_"+nc++;
    setNd(prev=>{const f=prev.filter(n=>n.id!=="end");return[...f,{id,name:m.name,type,properties:co(m.def||{})},prev.find(n=>n.id==="end")].filter(Boolean)});
    setEd(prev=>{const nx=[...prev];nx.splice(ei,1);
      if(m.cat==="condition"){nx.push({id:"e_"+eg.source+"_to_"+id,source:eg.source,target:id,isDefault:eg.isDefault,properties:co(eg.properties||{})});
        nx.push({id:"e_"+id+"_to_"+eg.target+"_default",source:id,target:eg.target,isDefault:true,properties:{}});
        let de = ""; if(type==="Condition_MemberRank") de = '\x24{memberRank == "VIP"}'; else if(type==="Condition_TotalSpending") de = '\x24{totalSpending >= 5000000}'; else if(type==="Condition_Location") de = '\x24{targetProvince == "Hanoi"}';
        nx.push({id:"e_"+id+"_to_"+eg.target+"_br"+nc,source:id,target:eg.target,isDefault:false,properties:{expression:de}});
      }else{nx.push({id:"e_"+eg.source+"_to_"+id,source:eg.source,target:id,isDefault:eg.isDefault,properties:co(eg.properties||{})});nx.push({id:"e_"+id+"_to_"+eg.target,source:id,target:eg.target,isDefault:false,properties:{}})}
      return nx});
    setSel(id); setAIE(null); st("Đã chèn: "+m.name,"success");
  };

  const aB = (nodeId)=>{
    const de = ed.find(e=>e.source===nodeId&&e.isDefault), tgt = de?de.target:"end", cn = nd.find(n=>n.id===nodeId), tp = cn?cn.type:"Condition_MemberRank";
    const ex = ed.filter(e=>e.source===nodeId&&!e.isDefault), used = new Set();
    ex.forEach(e=>{if(tp==="Condition_MemberRank"){const m=e.properties?.expression?.match(/==\s*'([^']+)'/);if(m)used.add(m[1])}});
    let de2 = ""; if(tp==="Condition_MemberRank"){const rks=["VIP","GOLD","SILVER","MEMBER"],u=rks.find(r=>!used.has(r))||"SILVER";de2='\x24{memberRank == "'+u+'"}'}
    else if(tp==="Condition_TotalSpending") de2 = '\x24{totalSpending >= 10000000}';
    else de2 = '\x24{targetProvince == "Hanoi"}';
    setEd(prev=>[...prev,{id:"e_"+nodeId+"_to_"+tgt+"_br"+nc,source:nodeId,target:tgt,isDefault:false,properties:{expression:de2}}]); nc++; st("Đã thêm nhánh","info");
  };

  const dB = (edgeId)=>{const eg=ed.find(e=>e.id===edgeId);if(!eg)return;if(eg.isDefault){st("Không thể xóa nhánh mặc định","error");return}setEd(prev=>prev.filter(e=>e.id!==edgeId));st("Đã xóa nhánh","info")};

  const cTT = (newType)=>{setNd(prev=>prev.map(n=>n.id==="start"?{...n,type:newType,properties:co(NODE_TYPES[newType]?.def||{})}:n))};

  const uP = (k,v)=>setNd(prev=>prev.map(n=>n.id===sel?{...n,properties:{...n.properties,[k]:v}}:n));
  const uN = (name)=>{setNd(prev=>prev.map(n=>n.id===sel?{...n,name}:n));setRI(null)};

  const rC = ()=>{setNd([{id:"start",name:"Bắt đầu",type:"Trigger_Event_NewUser",properties:{}},{id:"end",name:"Kết thúc",type:"End_Event",properties:{}}]);setEd([{id:"e_se",source:"start",target:"end",isDefault:false,properties:{}}]);setSel(null);setVR(null);setTab("editor");st("Đã đặt lại","info")};

  const val = async()=>{try{setSV(true);setTab("editor");const r=await campaignApi.validateWorkflow(buildGraphPayload(nd,ed));setVR(r?.data||{valid:true,summary:"OK"});st(r?.data?.valid?"✅ Hợp lệ":"❌ Có lỗi",r?.data?.valid?"success":"error")}catch(err){setVR({valid:false,summary:err.message,errors:[{message:err.message}]});st("Lỗi: "+err.message,"error")}};

  const dep = async(e)=>{e.preventDefault();try{await campaignApi.createCampaign({name:dF.name,totalBudget:Number(dF.budget),startDate:new Date(dF.startDate).toISOString(),endDate:new Date(dF.endDate).toISOString(),bpmnProcessDefinitionKey:dF.bpmnKey||("campaign_"+Date.now()),workflowJson:JSON.stringify(buildGraphPayload(nd,ed))});st("🚀 Triển khai thành công!","success");setSD(false);setDF({name:"",bpmnKey:"",budget:"",startDate:"",endDate:""});fc();setVw("list")}catch(err){st("Lỗi: "+err.message,"error")}};

  const tC = async(id,act)=>{try{await campaignApi.toggleCampaignActive(id,!act);fc()}catch(err){st("Lỗi: "+err.message,"error")}};
  const dC = async(id,name)=>{if(!window.confirm('Xóa chiến dịch "'+name+'"?'))return;try{await campaignApi.deleteCampaign(id);fc();st("Đã xóa","success")}catch(err){st("Lỗi: "+err.message,"error")}};
  const lC = async(camp)=>{try{const d=await campaignApi.getCampaign(camp.id);if(d.workflowJson){const g=JSON.parse(d.workflowJson);setNd(g.nodes||[]);setEd(g.edges||[])}setVw("editor");st("Đã tải chiến dịch","info")}catch(err){st("Lỗi: "+err.message,"error")}};

  useEffect(()=>{const h=(e)=>{if(e.key==="Delete"&&sel&&sel!=="start"&&sel!=="end")dN()};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)},[sel]);

  const jP = React.useMemo(()=>JSON.stringify(buildGraphPayload(nd,ed),null,2),[nd,ed]);
  const bX = React.useMemo(()=>fx(generateBPMNXML(nd,ed)),[nd,ed]);

  const cC = (txt,label)=>{navigator.clipboard.writeText(txt).then(()=>st("Đã sao chép "+label,"success")).catch(()=>st("Không thể sao chép","error"))};
  const dBpmn = ()=>{const blob=new Blob([bX],{type:"application/xml"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="workflow_"+Date.now()+".bpmn";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);st("Đã tải xuống BPMN","success")};

  const CSVG = ()=>{
    const[d,setD]=useState({w:800,h:600});
    useEffect(()=>{const el=cv.current;if(!el)return;const ro=new ResizeObserver(entries=>{for(const e of entries){const{width,height}=e.contentRect;setD({w:Math.max(width,800),h:Math.max(height,600)})}});ro.observe(el);return()=>ro.disconnect()},[]);
    return(<svg className="cb-svg-overlay" width={d.w} height={d.h} style={{minWidth:"100%",minHeight:"100%"}}>
      <defs><marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#64748b"/></marker><marker id="arrd" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#d97706"/></marker></defs>
      {ed.map(edge=>{const sEl=document.getElementById("cb-"+edge.source),tEl=document.getElementById("cb-"+edge.target),c=cv.current;if(!sEl||!tEl||!c)return null;
        const sr=sEl.getBoundingClientRect(),tr=tEl.getBoundingClientRect(),cr=c.getBoundingClientRect();
        let sx=sr.left-cr.left+sr.width/2,sy=sr.bottom-cr.top;const ex=tr.left-cr.left+tr.width/2,ey=tr.top-cr.top;
        const sn=nd.find(n=>n.id===edge.source),isC=sn&&NODE_TYPES[sn.type]?.cat==="condition";
        if(isC){const scx=sr.left-cr.left+sr.width/2,scy=sr.top-cr.top+sr.height/2,hd=ex-scx;if(hd<-50){sx=sr.left-cr.left;sy=scy}else if(hd>50){sx=sr.right-cr.left;sy=scy}else{sx=scx;sy=sr.bottom-cr.top}}
        const sc=edge.isDefault?"#d97706":"#4f46e5",d2=bEP(sx,sy,ex,ey,isC);
        return<g key={edge.id}><path d={d2} fill="none" stroke={sc} strokeWidth="2.5" strokeDasharray={edge.isDefault?"5,5":"none"} markerEnd={edge.isDefault?"url(#arrd)":"url(#arr)"}/>
          <path d={d2} fill="none" stroke="transparent" strokeWidth="24" style={{cursor:"cell",pointerEvents:"stroke"}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const t=e.dataTransfer.getData("text/plain");if(t)iNE(edge.id,t)}}/>
        </g>})}
    </svg>)
  };

  const TC = ()=>tt?<div className={"cb-toast show "+(tt.type==="success"?"success":tt.type==="error"?"error":"")}>{tt.msg}</div>:null;

  if(vw==="list"){
    return(<div className="cb-app"><TC/>
      <div className="cb-header"><div className="cb-logo"><div className="cb-logo-icon">⚡</div><div><h1>CampaignEngine</h1><span>Trình Thiết Kế Chiến Dịch Tiếp Thị Tự Động</span></div></div>
        <div className="cb-header-actions"><button className="cb-btn cb-btn-primary" onClick={()=>{rC();setVw("editor")}}>➕ Tạo Chiến Dịch</button></div>
      </div>
      <div style={{overflow:"auto",padding:"16px"}}>
        {load?<div className="cb-text-center" style={{padding:"40px"}}>⏳ Đang tải...</div>:(
        <table className="cb-table">
          <thead><tr><th>ID</th><th>Tên Chiến Dịch</th><th>Mã BPMN</th><th>Ngân Sách</th><th>Thời Gian</th><th>Trạng Thái</th><th>Thao Tác</th></tr></thead>
          <tbody>{camps.length===0?<tr><td colSpan={7} className="cb-text-center" style={{padding:"24px",color:"#94a3b8",fontSize:"12px"}}>Chưa có chiến dịch nào.</td></tr>:
            camps.map(c=>(<tr key={c.id}>
              <td style={{fontWeight:600}}>{c.id}</td><td style={{fontWeight:600}}>{c.name}</td>
              <td><code style={{fontSize:"10px",background:"#f1f5f9",padding:"1px 4px",borderRadius:"3px"}}>{c.bpmnProcessDefinitionKey}</code></td>
              <td>{Number(c.remainingBudget||c.totalBudget||0).toLocaleString("vi-VN")}đ</td>
              <td style={{fontSize:"10px"}}>{c.startDate?new Date(c.startDate).toLocaleDateString()+" → "+new Date(c.endDate).toLocaleDateString():""}</td>
              <td><span className={"cb-badge "+(c.active?"cb-badge-active":"cb-badge-suspended")}>{c.active?"KÍCH HOẠT":"TẠM NGỪNG"}</span></td>
              <td><div className="cb-flex-gap">
                <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>lC(c)}>✏️ Sửa</button>
                <button className="cb-btn cb-btn-sm" style={{border:"1px solid #e2e8f0",background:c.active?"#fef7e0":"#e8f5e9",color:c.active?"#d97706":"#059669"}} onClick={()=>tC(c.id,c.active)}>{c.active?"⏸ Tạm ngưng":"▶ Kích hoạt"}</button>
                <button className="cb-btn cb-btn-danger cb-btn-sm" onClick={()=>dC(c.id,c.name)}>🗑️ Xóa</button>
              </div></td>
            </tr>))}</tbody>
        </table>)}
      </div>
    </div>)
  }

  return(<div className="cb-app"><TC/>
    <div className="cb-header">
      <div className="cb-logo"><div className="cb-logo-icon">⚡</div><div><h1>CampaignEngine</h1><span>Trình Thiết Kế Chiến Dịch Tiếp Thị Tự Động</span></div></div>
      <div className="cb-header-actions">
        <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>{setVw("list");fc()}}>📂 DS Chiến Dịch</button>
        <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>{setNd(prev=>[...prev]);setEd(prev=>[...prev]);st("Đã căn chỉnh","success")}}>🎯 Căn Chỉnh</button>
        <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={val}>🔍 Kiểm Tra Sơ Đồ</button>
        <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={()=>setSD(true)}>🚀 Triển Khai Ngay</button>
        <button className="cb-btn cb-btn-danger cb-btn-sm" onClick={rC}>🗑️ Đặt Lại</button>
      </div>
    </div>

    <div className="cb-main-layout">
      <div className="cb-sidebar">
        <h2>Thư Viện Khối Hỗ Trợ</h2>
        <p className="cb-sidebar-desc">Nhấn vào nút <strong style={{color:"#6366f1"}}>+</strong> trên đường nối để chèn khối, hoặc kéo-thả từ đây.</p>
        {CAT_KEYS.map(cat=>(<div key={cat} className="cb-toolbox-group">
          <div className="cb-toolbox-header"><span className={"cb-dot "+(CAT_DOTS[cat])}></span><h3>{CAT_NAMES[cat]}</h3></div>
          <div className="cb-toolbox-cards">{Object.entries(NODE_TYPES).filter(([_,v])=>v.cat===cat).map(([type,meta])=>(
            <div key={type} className={"cb-toolbox-card cb-card-"+cat} draggable onDragStart={e=>{e.dataTransfer.setData("text/plain",type);setDT(type)}} onDragEnd={()=>setDT(null)} onClick={()=>aN(type)}>
              <span className="cb-card-icon">{meta.icon}</span><div className="cb-card-details"><h4>{meta.name}</h4><p>{type}</p></div>
            </div>
          ))}</div>
        </div>))}
        <div style={{fontSize:"9px",color:"#94a3b8",textAlign:"center",marginTop:"4px"}}>⌨ Delete để xóa khối</div>
      </div>

      <div className="cb-canvas-area" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dT)aN(dT)}} onClick={()=>{setSel(null);setRI(null);setAIE(null)}}>
        <div className="cb-canvas-header"><div><h2>Bản Vẽ Thiết Kế Sơ Đồ Quy Trình</h2><span className="cb-canvas-subtitle">Click chuột vào khối. Nhấp (+) trên đường dẫn để chèn khối.</span></div></div>
        <div className="cb-flow-canvas" ref={cv}>
          <CSVG/>
          {ed.map(edge=>{const sEl=document.getElementById("cb-"+edge.source),tEl=document.getElementById("cb-"+edge.target),c=cv.current;if(!sEl||!tEl||!c)return null;
            const sr=sEl.getBoundingClientRect(),tr=tEl.getBoundingClientRect(),cr=c.getBoundingClientRect();
            let sx=sr.left-cr.left+sr.width/2,sy=sr.bottom-cr.top;const ex=tr.left-cr.left+tr.width/2;
            const sn=nd.find(n=>n.id===edge.source),isC=sn&&NODE_TYPES[sn.type]?.cat==="condition";
            if(isC){const scx=sr.left-cr.left+sr.width/2,hd=ex-scx;if(hd<-50){sx=sr.left-cr.left;sy=sr.top-cr.top+sr.height/2}else if(hd>50){sx=sr.right-cr.left;sy=sr.top-cr.top+sr.height/2}else sx=scx}
            const mx=(sx+ex)/2,my=isC&&Math.abs(sx-ex)>=15?sy+15:(sy+(tr.top-cr.top))/2;
            let label="";if(sn&&NODE_TYPES[sn.type]?.cat==="condition"){if(edge.isDefault)label="Khác (Else)";else if(edge.properties?.expression){const e2=edge.properties.expression;
              if(sn.type==="Condition_MemberRank"){const m=e2.match(/==\s*['"]([^'"]+)['"]/);label=m?m[1]:""}else if(sn.type==="Condition_TotalSpending"){const m=e2.match(/totalSpending\s*(>=|<=|>|<|==)\s*(\d+)/);label=m?m[1]+" "+Number(m[2]).toLocaleString("vi-VN")+"đ":""}else if(sn.type==="Condition_AntiFraudScore"){const m=e2.match(/antiFraudScore\s*(>=|<=|>|<|==)\s*(\d+)/);label=m?m[1]+" "+m[2]:""}else{const m=e2.match(/==\s*['"]([^'"]+)['"]/);label=m?m[1]:e2}}}
            return<React.Fragment key={"mc_"+edge.id}>
              {label&&<div className="cb-edge-label" style={{left:mx,top:my-20}}>{label}</div>}
              <div className="cb-midpoint" style={{left:mx,top:my}} title={edge.isDefault?"Chèn vào luồng mặc định":"Chèn khối mới"}
                onClick={e=>{e.stopPropagation();setAIE(aIE===edge.id?null:edge.id)}}
                onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add("drag-over")}}
                onDragLeave={e=>e.currentTarget.classList.remove("drag-over")}
                onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove("drag-over");const t=e.dataTransfer.getData("text/plain");if(t)iNE(edge.id,t)}}>+</div>
            </React.Fragment>
          })}
          {aIE&&(()=>{const edge=ed.find(e=>e.id===aIE);if(!edge)return null;
            const sEl=document.getElementById("cb-"+edge.source),tEl=document.getElementById("cb-"+edge.target),c=cv.current;
            if(!sEl||!tEl||!c)return null;const sr=sEl.getBoundingClientRect(),tr=tEl.getBoundingClientRect(),cr=c.getBoundingClientRect();
            const mx=(sr.left-cr.left+sr.width/2+tr.left-cr.left+tr.width/2)/2,my=(sr.bottom-cr.top+tr.top-cr.top)/2;
            return<div className="cb-insert-popover" style={{left:mx-120,top:my+20}}>
              <div className="cb-insert-popover-header"><h4>Chèn Khối Mới</h4><button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>setAIE(null)}>✕</button></div>
              <div className="cb-insert-group"><h5>Điều Kiện Rẽ Nhánh</h5>{Object.entries(NODE_TYPES).filter(([_,m])=>m.cat==="condition").map(([type,meta])=> <button key={type} className="cb-insert-btn" onClick={()=>iNE(aIE,type)}>{meta.icon} {meta.name}</button>)}</div>
              <div className="cb-insert-group" style={{marginTop:8}}><h5>Hành Động Nhận Thưởng</h5>{Object.entries(NODE_TYPES).filter(([_,m])=>m.cat==="action").map(([type,meta])=> <button key={type} className="cb-insert-btn" onClick={()=>iNE(aIE,type)}>{meta.icon} {meta.name}</button>)}</div>
            </div>
          })()}
          {rw.map((rowNodes,lvl)=>(
            <div key={lvl} className="cb-flow-row">
              {(()=>{const a=[];for(let c=mn;c<=mx;c++)a.push(c);return a})().map(col=>{
                const node=rowNodes.find(n=>cols[n.id]===col);if(!node)return<div key={col} className="cb-grid-slot"></div>;
                const meta=NODE_TYPES[node.type],sel2=sel===node.id,isRen=rI===node.id;
                return<div key={node.id} id={"cb-"+node.id} className="cb-grid-slot">
                  <div className="cb-node-wrapper" onClick={e=>{e.stopPropagation();setSel(node.id)}}>
                    {node.id!=="start"&&node.id!=="end"?(isRen?<input type="text" value={rV} autoFocus className="cb-node-label" style={{width:120,borderColor:"#6366f1"}} onChange={e=>setRV(e.target.value)} onBlur={()=>uN(rV)} onKeyDown={e=>{if(e.key==="Enter")uN(rV);if(e.key==="Escape")setRI(null)}} onClick={e=>e.stopPropagation()}/>
                    :<div className="cb-node-label" onDoubleClick={()=>{setRI(node.id);setRV(node.name)}}>{node.name}</div>):null}
                    {node.id==="start"?<div className={"cb-shape-start "+(sel2?"selected":"")} onClick={e=>{e.stopPropagation();setSel(node.id)}}
                      onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add("drag-over")}} onDragLeave={e=>e.currentTarget.classList.remove("drag-over")}
                      onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove("drag-over");const t=e.dataTransfer.getData("text/plain");const m2=NODE_TYPES[t];if(m2?.cat==="trigger"){cTT(t);st("Đã thay đổi trigger: "+m2.name,"success")}else st("Chỉ thả trigger vào đây","error")}}>
                      <span className="icon">{meta?.icon||"🚀"}</span>
                    </div>:node.id==="end"?<div className={"cb-shape-end "+(sel2?"selected":"")}><span className="icon">{meta?.icon||"🏁"}</span></div>
                    :meta?.cat==="condition"?<div className={"cb-shape-condition "+(sel2?"selected":"")}><div className="cb-shape-condition-diamond"></div><div className="cb-shape-condition-content">{meta.icon}</div></div>
                    :<div className={"cb-shape-action "+(sel2?"selected":"")} style={sel2?{borderColor:"#6366f1",borderLeftColor:"#6366f1"}:{}} onDoubleClick={()=>{setRI(node.id);setRV(node.name)}}>
                      <span className="badge">{meta?.name}</span><span className="title">{node.name}</span>
                    </div>}
                  </div>
                </div>
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="cb-sidebar-right" onClick={e=>e.stopPropagation()}>
        {sN?<div key={sN.id}>
          <div className="cb-panel-header" style={{display:"flex",justifyContent:"space-between"}}><span>Thuộc Tính</span>{sN.id!=="start"&&sN.id!=="end"&&<button className="cb-btn cb-btn-danger cb-btn-sm" onClick={dN}>🗑️ Xóa</button>}</div>
          <div className="cb-fg"><label>Mã định danh (ID)</label><input type="text" value={sN.id} disabled style={{background:"#e2e8f0",fontFamily:"monospace"}}/></div>
          {sN.id!=="start"&&sN.id!=="end"&&<div className="cb-fg"><label>Tên khối</label><input type="text" value={sN.name} onChange={e=>uN(e.target.value)}/></div>}
          {sN.id==="start"&&<div className="cb-fg"><label>Loại Trigger</label>
            <select value={sN.type} onChange={e=>cTT(e.target.value)}>
              <option value="Trigger_Event_NewUser">👤 Đăng ký mới</option>
              <option value="Trigger_Event_OrderSuccess">🛒 Mua hàng thành công</option>
              <option value="Trigger_Event_ReviewProduct">⭐ Đánh giá sản phẩm</option>
              <option value="Trigger_Timer_Schedule">⏰ Hẹn giờ định kỳ</option>
            </select>
          </div>}
          {Object.entries(sN.properties||{}).map(([k,v])=>{if(k==="allowedRanks")return null;return<div key={k} className="cb-fg"><label>{k}</label>
            {Array.isArray(v)?<input type="text" value={v.join(", ")} onChange={e=>uP(k,e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} placeholder="Cách nhau bằng dấu phẩy"/>
            :<input type={typeof v==="number"?"number":"text"} value={v} onChange={e=>uP(k,typeof v==="number"?Number(e.target.value):e.target.value)}/>}
          </div>})}
          {NODE_TYPES[sN.type]?.cat==="condition"&&<div className="cb-edge-section">
            <div className="cb-edge-header"><label>Điều kiện rẽ nhánh (Edges)</label><button className="cb-btn cb-btn-secondary cb-btn-sm" style={{padding:"2px 8px",fontSize:"9px",height:"auto"}} onClick={()=>aB(sN.id)}>➕ Thêm Nhánh</button></div>
            {ed.filter(e=>e.source===sN.id).map(edge=>{const tgt=nd.find(n=>n.id===edge.target),tgtN=tgt?.name||edge.target;
              if(edge.isDefault)return<div key={edge.id} className="cb-edge-card cb-edge-default" style={{marginTop:"6px"}}>
                <span style={{fontSize:"10px",fontWeight:700,color:"#b06000"}}>NHÁNH MẶC ĐỊNH (Else): → {tgtN}</span>
                <small style={{display:"block",fontSize:"9px",color:"#64748b",marginTop:"2px"}}>Tự động kích hoạt khi tất cả điều kiện khác thất bại.</small>
              </div>;
              const parsed=pe(sN.type,edge.properties?.expression);
              return<div key={edge.id} className="cb-edge-card" style={{marginTop:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                  <span style={{fontSize:"10px",fontWeight:700}}>NHÁNH: → {tgtN}</span>
                  <button className="cb-btn cb-btn-danger cb-btn-sm" style={{padding:"1px 6px",fontSize:"9px",height:"auto",background:"none"}} onClick={()=>dB(edge.id)}>❌ Xóa</button>
                </div>
                {sN.type==="Condition_MemberRank"&&<div className="cb-fg" style={{marginBottom:0}}><label style={{fontSize:"9px"}}>Hạng</label>
                  <select value={parsed.rank||"VIP"} onChange={e=>{const v=e.target.value;setEd(prev=>prev.map(ed=>ed.id===edge.id?{...ed,properties:{...ed.properties,expression:'\x24{memberRank == "'+v+'"}'}}:ed))}}>
                  <option value="MEMBER">MEMBER</option><option value="SILVER">SILVER</option><option value="GOLD">GOLD</option><option value="VIP">VIP</option></select>
                </div>}
                {sN.type==="Condition_TotalSpending"&&<div style={{display:"flex",gap:6}}>
                  <div className="cb-fg" style={{flex:1,marginBottom:0}}><label style={{fontSize:"9px"}}>Phép toán</label>
                    <select value={parsed.operator||">="} onChange={e=>{const op=e.target.value;const amt=parsed.amount||5000000;setEd(prev=>prev.map(ed=>ed.id===edge.id?{...ed,properties:{...ed.properties,expression:'\x24{totalSpending '+op+' '+amt+'}'}}:ed))}}>
                    <option value=">=">≥</option><option value=">">&gt;</option><option value="<=">≤</option><option value="<">&lt;</option><option value="==">=</option></select>
                  </div>
                  <div className="cb-fg" style={{flex:1,marginBottom:0}}><label style={{fontSize:"9px"}}>Số tiền</label>
                    <input type="number" value={parsed.amount||5000000} onChange={e=>{const amt=Number(e.target.value);const op=parsed.operator||">=";setEd(prev=>prev.map(ed=>ed.id===edge.id?{...ed,properties:{...ed.properties,expression:'\x24{totalSpending '+op+' '+amt+'}'}}:ed))}}/>
                  </div>
                </div>}
                {(sN.type==="Condition_Location"||sN.type==="Condition_ContainsCategory"||sN.type==="Condition_ContainsProduct")&&<div className="cb-fg" style={{marginBottom:0}}><label style={{fontSize:"9px"}}>Giá trị</label>
                  <input type="text" value={parsed.value||""} onChange={e=>{const v=e.target.value;let expr='\x24{targetProvince == "'+v+'"}';if(sN.type==="Condition_ContainsCategory")expr='\x24{containsCategory == "'+v+'"}';if(sN.type==="Condition_ContainsProduct")expr='\x24{containsProduct == "'+v+'"}';setEd(prev=>prev.map(ed=>ed.id===edge.id?{...ed,properties:{...ed.properties,expression:expr}}:ed))}}/>
                </div>}
                {sN.type==="Condition_AntiFraudScore"&&<div style={{display:"flex",gap:6}}>
                  <div className="cb-fg" style={{flex:1,marginBottom:0}}><label style={{fontSize:"9px"}}>Phép toán</label>
                    <select value={parsed.operator||"<="} onChange={e=>{const op=e.target.value;const sc=parsed.score||50;setEd(prev=>prev.map(ed=>ed.id===edge.id?{...ed,properties:{...ed.properties,expression:'\x24{antiFraudScore '+op+' '+sc+'}'}}:ed))}}>
                    <option value="<=">≤</option><option value="<">&lt;</option><option value=">=">≥</option><option value=">">&gt;</option><option value="==">=</option></select>
                  </div>
                  <div className="cb-fg" style={{flex:1,marginBottom:0}}><label style={{fontSize:"9px"}}>Điểm</label>
                    <input type="number" min={1} max={100} value={parsed.score||50} onChange={e=>{const sc=Number(e.target.value);const op=parsed.operator||"<=";setEd(prev=>prev.map(ed=>ed.id===edge.id?{...ed,properties:{...ed.properties,expression:'\x24{antiFraudScore '+op+' '+sc+'}'}}:ed))}}/>
                  </div>
                </div>}
              </div>
            })}
          </div>}
        </div>:<div className="cb-no-sel"><div className="icon">💡</div><p>Chọn khối trên bản vẽ để cấu hình.</p></div>}
      </div>
    </div>

    <div className="cb-bottom-panel">
      <div className="cb-tabs">
        {[{k:"editor",l:"🔍 Kết quả kiểm tra (Validation)"},{k:"json",l:"📋 Xem JSON Workflow Graph"},{k:"bpmn",l:"📄 Xem BPMN XML Preview"},{k:"campaigns",l:"📂 Danh Sách Chiến Dịch"}].map(t=>(
          <button key={t.k} className={"cb-tab-btn "+(tab===t.k?"active":"")} onClick={()=>{setTab(t.k);if(t.k==="campaigns")fc()}}>{t.l}</button>
        ))}
      </div>
      <div className="tab-content-container" style={{flex:1,overflow:"auto",padding:"10px",background:"#fff",position:"relative"}}>
        <div className={"cb-tab-content "+(tab==="editor"?"active":"")}>
          {sV&&vR?<>
            <div className={"cb-val-summary "+(vR.valid?"cb-val-success":"cb-val-failed")}>{vR.valid?"✅ Cấu hình hợp lệ! Sơ đồ hoàn toàn đáp ứng các tiêu chuẩn kỹ thuật & quy tắc vận hành.":"❌ Cấu hình không hợp lệ!"}</div>
            {vR.errors?.length>0&&<div className="cb-val-errors">{vR.errors.map((err,i)=><div key={i} className="cb-val-card">
              <div className="cb-val-card-header"><span>Khối: {err.nodeId||"Hệ thống"}</span><span>LỖI</span></div><div className="cb-val-card-msg">{err.message}</div>
            </div>)}</div>}
            {(!vR.errors||vR.errors.length===0)&&vR.valid&&<button className="cb-btn cb-btn-primary cb-btn-sm" onClick={()=>setSD(true)}>🚀 Triển khai ngay</button>}
          </>:<div className="cb-no-sel" style={{padding:"20px"}}><div className="icon">🔍</div><p>Nhấn <strong>Kiểm Tra Sơ Đồ</strong> để bắt đầu.</p></div>}
        </div>
        <div className={"cb-tab-content "+(tab==="json"?"active":"")}>
          <div className="cb-json-bar"><span>Cấu trúc JSON Graph:</span>
            <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>cC(jP,"JSON")}>Sao Chép JSON</button>
          </div>
          <div className="cb-code-block" style={{maxHeight:"160px"}}><code>{jP}</code></div>
        </div>
        <div className={"cb-tab-content "+(tab==="bpmn"?"active":"")}>
          <div className="cb-json-bar"><span>Preview BPMN XML:</span>
            <div style={{display:"flex",gap:4}}>
              <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>cC(bX,"BPMN XML")}>Sao Chép XML</button>
              <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={dBpmn}>💾 Tải .bpmn</button>
            </div>
          </div>
          <div className="cb-code-block" style={{maxHeight:"160px"}}><code>{bX}</code></div>
        </div>
        <div className={"cb-tab-content "+(tab==="campaigns"?"active":"")}>
          <table className="cb-table">
            <thead><tr><th>ID</th><th>Tên</th><th>Mã BPMN</th><th>Ngân Sách</th><th>Trạng Thái</th><th>Thao Tác</th></tr></thead>
            <tbody>{camps.length===0?<tr><td colSpan={6} className="cb-text-center" style={{padding:"16px",color:"#94a3b8"}}>Đang tải...</td></tr>:
              camps.map(c=><tr key={c.id}><td>{c.id}</td><td style={{fontWeight:600}}>{c.name}</td>
                <td><code style={{fontSize:"9px",background:"#f1f5f9",padding:"1px 4px",borderRadius:"3px"}}>{c.bpmnProcessDefinitionKey}</code></td>
                <td>{Number(c.totalBudget||0).toLocaleString("vi-VN")}đ</td>
                <td><span className={"cb-badge "+(c.active?"cb-badge-active":"cb-badge-suspended")}>{c.active?"KÍCH HOẠT":"TẠM NGỪNG"}</span></td>
                <td><div className="cb-flex-gap">
                  <button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>lC(c)}>✏️</button>
                  <button className="cb-btn cb-btn-sm" style={{border:"1px solid #e2e8f0",background:c.active?"#fef7e0":"#e8f5e9",color:c.active?"#d97706":"#059669"}} onClick={()=>tC(c.id,c.active)}>{c.active?"⏸":"▶"}</button>
                  <button className="cb-btn cb-btn-danger cb-btn-sm" onClick={()=>dC(c.id,c.name)}>🗑️</button>
                </div></td>
              </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>

    {sD&&<div className="cb-modal-overlay" onClick={()=>setSD(false)}>
      <div className="cb-modal" onClick={e=>e.stopPropagation()}>
        <div className="cb-modal-header"><h2>🚀 Triển Khai Chiến Dịch</h2><button className="cb-btn cb-btn-secondary cb-btn-sm" onClick={()=>setSD(false)}>✕</button></div>
        <form onSubmit={dep}>
          <div className="cb-fg"><label>Tên chiến dịch *</label><input type="text" required value={dF.name} onChange={e=>setDF({...dF,name:e.target.value})} placeholder="VD: Khuyến mãi Ngày Vàng"/></div>
          <div className="cb-fg"><label>Mã BPMN Key *</label><input type="text" required value={dF.bpmnKey} onChange={e=>setDF({...dF,bpmnKey:e.target.value})} placeholder="gold_day_june" pattern="^[a-zA-Z0-9_]+$"/><small>Chỉ gồm chữ, số, gạch dưới.</small></div>
          <div className="cb-fg"><label>Ngân sách (VNĐ) *</label><input type="number" min={1} required value={dF.budget} onChange={e=>setDF({...dF,budget:e.target.value})} placeholder="50000000"/></div>
          <div className="cb-form-row">
            <div className="cb-fg"><label>Bắt đầu *</label><input type="datetime-local" required value={dF.startDate} onChange={e=>setDF({...dF,startDate:e.target.value})}/></div>
            <div className="cb-fg"><label>Kết thúc *</label><input type="datetime-local" required value={dF.endDate} onChange={e=>setDF({...dF,endDate:e.target.value})}/></div>
          </div>
          <div className="cb-modal-actions">
            <button type="button" className="cb-btn cb-btn-secondary" onClick={()=>setSD(false)}>Hủy</button>
            <button type="submit" className="cb-btn cb-btn-primary">🚀 Triển Khai</button>
          </div>
        </form>
      </div>
    </div>}
  </div>)
}
