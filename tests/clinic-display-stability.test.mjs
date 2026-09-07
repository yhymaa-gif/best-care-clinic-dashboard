import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../dashboard.js',import.meta.url),'utf8');
const scope=vm.createContext({});
vm.runInContext(script.slice(script.indexOf('function reconcileClinicDisplay('),script.indexOf('function syncClinicTopmostDisplay(')),scope);
const reconcile=scope.reconcileClinicDisplay;
class Node {
  constructor(name,children=[],attrs={}){this.nodeName=name;this.nodeType=name==='#text'?3:1;this.childNodes=children;this.attrs={...attrs};this.nodeValue='';this.scrollTop=0;this.writes=0}
  get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}))}
  get lastChild(){return this.childNodes.at(-1)}
  hasAttribute(name){return Object.hasOwn(this.attrs,name)}
  getAttribute(name){return this.attrs[name]??null}
  setAttribute(name,value){this.attrs[name]=value;this.writes++}
  removeAttribute(name){delete this.attrs[name];this.writes++}
  appendChild(node){this.childNodes.push(node);this.writes++;return node}
  replaceChild(node,old){this.childNodes[this.childNodes.indexOf(old)]=node;this.writes++}
  removeChild(node){this.childNodes.splice(this.childNodes.indexOf(node),1);this.writes++}
  cloneNode(){const node=new Node(this.nodeName,this.childNodes.map(c=>c.cloneNode(true)),this.attrs);node.nodeValue=this.nodeValue;return node}
}
const text=value=>Object.assign(new Node('#text'),{nodeValue:value});
const frame=(value,status='active')=>new Node('DIV',[new Node('ARTICLE',[new Node('B',[text(value)])],{class:status})]);

test('60 timer ticks preserve live card and timer nodes and scroll position',()=>{
  const target=frame('00:00:00'),card=target.childNodes[0],timer=card.childNodes[0],digits=timer.childNodes[0];
  target.scrollTop=175;
  for(let i=1;i<=60;i++)reconcile(target,frame(String(i)));
  assert.equal(target.childNodes[0],card);
  assert.equal(card.childNodes[0],timer);
  assert.equal(timer.childNodes[0],digits);
  assert.equal(digits.nodeValue,'60');
  assert.equal(target.scrollTop,175);
  assert.equal(target.writes+card.writes+timer.writes,0);
});
test('status, queue removal, new nodes and expired alerts are reflected without stale content',()=>{
  const target=frame('10'),card=target.childNodes[0];
  reconcile(target,frame('11','overrun'));
  assert.equal(target.childNodes[0],card);
  assert.equal(card.getAttribute('class'),'overrun');
  const source=frame('12');source.childNodes.push(new Node('SECTION',[text('next patient')]));
  reconcile(target,source);assert.equal(target.childNodes.length,2);
  reconcile(target,frame('13'));assert.equal(target.childNodes.length,1);
  reconcile(target,new Node('DIV'));assert.equal(target.childNodes.length,0);
  reconcile(target,frame('14'));assert.equal(target.childNodes[0].childNodes[0].childNodes[0].nodeValue,'14');
});
