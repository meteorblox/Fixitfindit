import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPartnerStore} from './partner-applications.mjs';
test('applications stay private pending approval; duplicate email and slug are protected',()=>{
 const db=createPartnerStore(':memory:');try{
 const input={email:'TEST@example.com',name:'Test',brand:'Test Finds',website:'https://example.com'};
 db.apply(input);db.apply(input);assert.equal(db.list().length,1);assert.equal(db.find('test-finds'),undefined);
 const id=db.list()[0].id;assert.throws(()=>db.approve(id,'home-helper'));db.approve(id,'test-finds');
 assert.equal(db.find('test-finds').demo,false);assert.equal(db.find('test-finds').email,undefined);
 db.apply({...input,email:'second@example.com'});assert.throws(()=>db.approve(db.list().find(r=>r.status==='pending').id,'test-finds'));
 assert.throws(()=>db.apply({...input,email:'invalid'}));
 }finally{db.close();}
});
