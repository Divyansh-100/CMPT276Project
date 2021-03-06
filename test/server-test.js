var chai = require('chai');
var chaiHttp = require('chai-http');
var server = require('../index');
var should = chai.should();
var expect = chai.expect;

chai.use(chaiHttp);

const userCredentials = {username:'john', mypassword:'guest'}





var authenticatedUser = chai.request.agent(app);
before(function(done){
  authenticatedUser
    .post('/authentification')
    .send(userCredentials)
    .end(function(err, res){
      res.should.have.status(200)
      done();
    });
});
// describe('create chat', function(){
//     // all the tests associated with Users
//     it('should add a new chat room with unique id', function(done){
//         chai.request(server).post('/home').send({'username':'tester mctesty', 'chatnameinput':'test group'})
//             .end(function(error,res){
//                 res.should.have.status(200);
//                 res.should.be.json;
//                 done();
//             });
//     });
// });

describe('GET /chat', function(done){
    //addresses 2nd bullet point: if the user is not logged in we should get a 302 response code and be directed to the /login page
    it('should return a 302 response and redirect to /login', function(done){
        chai.request(app).get('/chat/0')
        .end(function(error,res){
            expect(res).to.have.status(200);
            expect(res).to.have.header('location', '/');
            done();
        });
      });
    //addresses 1st bullet point: if the user is logged in we should get a 200 status code
    it('should return a 200 response if the user is logged in', function(done){
        authenticatedUser.get('/chat/0')
        .end(function(error,res){
            res.should.have.status(200);
            done();
        });
      });
    });