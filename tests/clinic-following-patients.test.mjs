import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dashboard.js',import.meta.url),'utf8');
const render=source.slice(source.indexOf('function renderUpcoming(lead){'),source.indexOf('function updateUpcomingCardVisuals(){'));
test('following list excludes the detailed next patient, preserves order and does not mutate the queue',()=>{
  const queue=[{id:2,name:'Next Patient',start:'10:00'},{id:3,name:'Third Patient',start:'10:30'},{id:4,name:'Fourth Patient',start:'11:00'}];
  const before=JSON.stringify(queue);
  const nodes={followingPatients:{},followingPatientsTitle:{},upcomingStack:{}};
  let pending=queue;
  const context=vm.createContext({$:id=>nodes[id],lang:'en',upcomingPatients:()=>pending,firstName:name=>name.split(' ')[0],escapeHtml:String,statusText:String,derivedStatus:()=> 'Waiting'});
  vm.runInContext(render+';renderUpcoming({id:1})',context);
  assert.equal(nodes.followingPatients.hidden,false);
  assert.doesNotMatch(nodes.upcomingStack.innerHTML,/>Next</);
  assert.match(nodes.upcomingStack.innerHTML,/>Third</);
  assert.ok(nodes.upcomingStack.innerHTML.indexOf('Third')<nodes.upcomingStack.innerHTML.indexOf('Fourth'));
  assert.equal(JSON.stringify(queue),before);
  pending=queue.slice(0,1);
  vm.runInContext('renderUpcoming({id:1})',context);
  assert.equal(nodes.followingPatients.hidden,true);
  assert.equal(nodes.upcomingStack.innerHTML,'');
  vm.runInContext('renderUpcoming(null)',context);
  assert.equal(nodes.followingPatients.hidden,true);
});
