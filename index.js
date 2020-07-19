const express = require('express')
const session = require('express-session')
const bodyParser = require('body-parser')
const path = require('path')
const PORT = process.env.PORT || 5000
const multer = require('multer')
const fs = require('fs')

const google = require('googleapis').google;
const jwt = require('jsonwebtoken');
const CONFIG = require('./config');
// Google's OAuth2 client
const OAuth2 = google.auth.OAuth2;
// Allowing ourselves to use cookies
const cookieParser = require('cookie-parser');

require('dotenv').config();

// Storgae destination for profile pictures, and the name of the picture.
const storage = multer.diskStorage({
  destination: (req, file, func) => {
    func(null, './pictures/')
  },
  filename: (req, file, func) => {
    func(null, `id${req.session.loggedID}` )
  }
})

// Only allowing jpeg or png files for profile pictures.
const fileFilter = (req, file, func) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg'){
    func(null, true)
  }
  else {
    func(null, false)
  }
}

// Adding the features outlined above to the multer object.
const pictures = multer({storage: storage, fileFilter: fileFilter})

const {Pool} = require('pg');
var pool;
pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:root@localhost/appdatabase'
})

checkLogin = (req, res, next) => {
  if(req.session.loggedin){
    next()
  }
  else {
    res.redirect('/' + '?valid=log')
  }
}

app = express()

//setup for socket.io
const http = require('http').Server(express())
const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
const io = require('socket.io').listen(server);

  app.use(session({
    secret : 'theSecret',
    resave : true,
    saveUninitialized : true
  }))
  app.use(cookieParser());
  app.use(express.json())
  app.use(express.urlencoded({extended:false}))
  app.use(bodyParser.urlencoded({extended : true}))
  app.use(bodyParser.json())
  app.use(express.static(path.join(__dirname, 'public')))
  app.use('/pictures', express.static('pictures'))
  app.set('views', path.join(__dirname, 'views'))
  app.set('view engine', 'ejs')
  

  // Takes you to the login page whenever the app is opened.
  app.get('/', (req, res) => res.render('pages/Login', {'alert' : req.query.valid}))

  // Takes you to the registration page when the user clicks register from the login page.
  app.get('/register', (req,res) => {
    res.render('pages/Register', {'alert' : req.query.error})
  })

  // The homepage for every user, customized to their personal info.
  app.get('/home', checkLogin, (req, res) => {

    var userPageQuery = `select * from users where id = ${req.session.loggedID}`;

    pool.query(userPageQuery, (error, result) => {
      if(error)
        res.send(error)

      res.render('pages/userHomepage', {'username' : req.session.username, 'id' :req.session.loggedID})
    })


  })

  app.get('/notifications', checkLogin, (req, res) => {

    res.render('pages/notifications', {'username' : req.session.username, 'id' : req.session.loggedID})

  })

app.get('/admin', checkLogin, async (req,res) => {
  var adminCheck = `select * from users where id = ${req.session.loggedID} AND usertype='A';`
  await pool.query(adminCheck, (error, result) => {
    if(error)
        res.send(error)

    if(result.rows.length == 0){
      req.session.destroy()
      return res.redirect("/" + '?valid=accessDenied')
    } else {
      var insertQuery=`SELECT * FROM users`;
      pool.query(insertQuery, (error, result) => {
        if(error)
          res.send(error)
        var results = {'rows':result.rows};
        res.render('pages/admin', results);
        });
      }
    })
  })



  app.get('/mymusic', checkLogin, (req, res) => {
    if (!req.cookies.jwt) {
      // We haven't logged in
      return res.redirect('/google_login');
    }
    // Create an OAuth2 client object from the credentials in our config file
    const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
    // Add this specific user's credentials to our OAuth2 client
    oauth2Client.credentials = jwt.verify(req.cookies.jwt, CONFIG.JWTsecret);
    // Get the youtube service
    const service = google.youtube('v3');
    // Get five of the user's subscriptions (the channels they're subscribed to)
    service.search.list({
      auth: oauth2Client,
      part: 'snippet',
      maxResults: 25,
      q: "daft punk"
    }).then(response => {
      // Render the data view, passing the subscriptions to it
      return  res.render('pages/mymusic', { 'username' : req.session.username, 'id' : req.session.loggedID, search: response.data.items });
    });
  });
  

  app.post('/search', checkLogin, async (req, res) => {

    var current = {'username' : req.session.username}

    if( req.body.searchInput == ""){
      current.results = []
      res.render('pages/resultsPage', current)
    }
    else {

    await SpotifyAPI.searchTracks(`${req.body.searchInput}`, {limit: 5}).then( (data, error) => {
      if(error){
        res.send(error)
      } else {
        var songs = []
        for (each of data.body.tracks.items){
          var song = {}
          song.name = each.name
          song.artists = each.artists.map(a => a.name)
          song.picture = each.album.images[0].url

          song.populariity = each.popularity
          songs.push(song)
        }
        current.spotifySongs = songs
      }
    });

    await SpotifyAPI.searchArtists(`${req.body.searchInput}`, {limit: 5}).then( (data, error) => {
      if(error){
        res.send(error)
      } else {
        var artists = []
        for (each of data.body.artists.items){
          var artist = {}
          artist.name = each.name

          // This function takes each genre and capitalizes the first letters.
          artist.genres = each.genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

          artist.picture = each.images[0].url
          artist.popularity = each.popularity

          artists.push(artist)

        }
        current.spotifyArtists = artists
      }

    });

    if (!req.cookies.jwt) {
      current.youtubevideos = '/google_login'
    } else {
      var ytube;
      // Create an OAuth2 client object from the credentials in our config file
      const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
      // Add this specific user's credentials to our OAuth2 client
      oauth2Client.credentials = jwt.verify(req.cookies.jwt, CONFIG.JWTsecret);
      // Get the youtube service
      const service = google.youtube('v3');
      // Get five of the user's subscriptions (the channels they're subscribed to)
      await service.search.list({
        auth: oauth2Client,
        part: 'snippet',
        maxResults: 25,
        q: req.body.searchInput
      }).then(response => {
        // Render the data view, passing the subscriptions to it
        current.youtubevideos = response.data.items
      });
    }


      var searchQuery = `select * from users where username like'${req.body.searchInput}%'`

      pool.query(searchQuery, (error, result) => {
        if(error)
          res.send(error)

        current.results = result.rows

        var checkFollowers = `select is_following from followers where the_user = ${req.session.loggedID} `

        pool.query(checkFollowers, (error, result) => {
          if(error)
            res.send(error)

          var check = []

          result.rows.filter(function(each) {
            check.push(each.is_following)
          })

          current.followers = check

          res.render('pages/resultsPage', current)
        })

      })
    }

  })

  app.get('/userSelect/:id', checkLogin, (req, res) => {

    var checkFollowingStatus = `select * from followers where the_user = ${req.session.loggedID} and is_following = ${req.params.id} `

    pool.query(checkFollowingStatus, (error, result) => {
      if(error)
        res.send(error)

      var gatherUser = `select * from users where id = ${req.params.id}`
      var current = {'username' : req.session.username}

      if(result.rows.length == 0){
        current.following = false
      }
      else {
        current.following = true
      }

      pool.query(gatherUser, (error, result) => {
        if(error)
          res.send(error)

        current.results = result.rows[0]

        res.render('pages/requestedPage', current)
      })

    })

  })

  app.post('/interact/:id', checkLogin, (req, res) => {
    if(req.body.follow){

      var addFollow = `insert into followers values(default, ${req.session.loggedID}, ${req.params.id})`

      pool.query(addFollow, (error, result) => {
        if(error)
          res.send(error)

        res.redirect('/userSelect/' + req.params.id)
      })


    } else if(req.body.unFollow){
      var unFollow = `delete from followers where the_user = ${req.session.loggedID} and is_following = ${req.params.id}`

      pool.query(unFollow, (error, result) => {
        if(error)
          res.send(error)

        res.redirect('/userSelect/' + req.params.id)
      })

    }

    else {
      var checkforchat = "SELECT chatid FROM chats WHERE participants = array['" 
      + req.session.username 
      + "',(SELECT username FROM users WHERE id = "
      + req.params.id
      + ")] OR participants = array[(SELECT username FROM users WHERE id = "
      + req.params.id
      + "),'"
      + req.session.username
      + "'] ORDER BY chatid DESC LIMIT 1";
      pool.query(checkforchat, (error, result) => {
        if(error){
          res.send(error);
        }
        else{
          if (result.rows.length > 0){
            res.redirect('/chat/' + result.rows[0].chatid)
          }
          else{
            var makeDMchat = "INSERT INTO chats VALUES (default, CONCAT('" 
            + req.session.username 
            + " and ',"
            + "(SELECT username FROM users WHERE id = "
            + req.params.id
            + ")), ARRAY ['" + req.session.username + "',(SELECT username FROM users WHERE id = "
            + req.params.id
            + ")]);SELECT chatid FROM chats WHERE participants = array['" 
            + req.session.username 
            + "',(SELECT username FROM users WHERE id = "
            + req.params.id
            + ")] OR participants = array[(SELECT username FROM users WHERE id = "
            + req.params.id
            + "),'"
            + req.session.username
            + "'] ORDER BY chatid DESC LIMIT 1";
            pool.query(makeDMchat, (error, result) => {
              if(error)
                res.send(error);
              res.redirect('/chat/' + result[1].rows[0].chatid)
            });
          }
        }
      })
    }

  })

  // Each users personal profile which can be accessed by clicking the users name in the top right corner of the navigaiton bar.
  app.get('/profile', checkLogin, (req, res) => {

    if (req.query.valid == 'false'){
      if (req.query.field == 'pic'){
        var alert = 'pic'
      }
      else{
        var alert = 'uname'
      }
    }
    else {
      var alert = false
    }

    var allQuery = `select * from users where id = ${req.session.loggedID}`
    pool.query(allQuery, (error, result) => {
      if(error)
        res.send(error)

      var data = result.rows[0]
      data.alert = alert
      data.spotify = req.session.Spotify

      res.render('pages/profile', data )
    })

  })

  app.get('/logout', (req, res) => {
    req.session.destroy()
    res.redirect('/')
  })

  // The registration page that users will be directed to when they click the link on the login page to make an account.
  app.post('/registration', async (req,res)=> {
    var uname=req.body.my_username;
    var email=req.body.my_email.toLowerCase();
    var password1=req.body.my_password1;
    var password2=req.body.my_password2;
    var keep = false;

    if(password1!=password2){
      return res.redirect("/register" + '?error=password')
    }
    else {
    var check = `SELECT username, email from users where username = '${uname}' or email = '${email}';`

    await pool.query(check, (error, result) => {
      if(error)
          res.send(error)

      if(result.rows.length != 0){
        result.rows.forEach(function(x){
          if(x.username == uname){
            return res.redirect("/register" + '?error=username')
          }
          else if(x.email == email){
            return res.redirect("/register" + '?error=email')
          }
        })
      }
      else{

        var insertQuery=`INSERT INTO users(username,email,password) VALUES('${uname}','${email}','${password2}')`;
        pool.query(insertQuery, (error, result) => {
          if(error)
            res.send(error)
        });
          return res.redirect("/" + '?valid=registered')

    }
  })
}

    });

  // This function accepts the login details from the user, and checks if they are in the database. If they are, it brings them to their homepage, if not, it sends an error message.
  app.post('/authentification', async (req,res)=> {
    var username=req.body.username;
    var upassword=req.body.mypassword;
    const client = await pool.connect();
    var selectQuery= `SELECT id, username, password FROM users WHERE username='${username}'`;
         pool.query(selectQuery,(error,result) =>{
           if(error){res.send(error)}


           var results = {'rows': result.rows}
           if(Object.keys(results.rows).length===0 ){
             res.redirect('/' + '?valid=username');
           }
           else{
           if(results.rows[0].username==username && results.rows[0].password==upassword){
             req.session.loggedin = true;
             req.session.loggedID = results.rows[0].id
             req.session.username = results.rows[0].username

             // Regular Client credentials for users without spotify.
             SpotifyAPI.clientCredentialsGrant().then( (data, error) => {
               if(error){
                 res.send(error)
               } else {
                 SpotifyAPI.setAccessToken(data.body['access_token']);
               }
             })

             res.redirect('/home')
           }
           else{
             res.redirect('/' + '?valid=password');  // After user enters wrong password they will get rendered to this page
           }
         }
         })
      });

    app.get('/passwordReset', (req, res) => {
      res.render('pages/passwordReset', {'alert' : req.query.valid})
    })

    app.post('/ForgotPassword', async(req,res)=>{
        var email=req.body.myemail.toLowerCase();
        var password1=req.body.mypassword1;
        var password2=req.body.mypassword2;

        if(password1!=password2){
          res.redirect('/passwordReset' + "?valid=match" );
        }
        else{
          const client=await pool.connect();
            var updateQuery=`UPDATE users SET password='${password2}' WHERE email='${email}'`;
            const result = await client.query(updateQuery);
            client.release();
            if (result.rowCount == 0){
              res.redirect('/passwordReset' + "?valid=unknown" );
            }
            else{
               res.redirect('/' + "?valid=changed");
            }

          }
        });
  // This function updates the users profile picture. If the picture is valid it will change, if not, and error will be sent.
  app.post('/pictureChoose', checkLogin, pictures.single('profilePicture'), (req, res) => {

    if (!req.file){
      res.redirect('/profile' + '?valid=false' + '&field=pic')
    }
    else {
      var pictureUpdate = `update users set picture = '/${req.file.path}' where id = ${req.session.loggedID}`

      var picturedelete =  `select picture from users where id = ${req.session.loggedID}`

      pool.query(picturedelete, (error, result) => {
        if(error)
          res.send(error)

        if(result.rows[0].picture != '/pictures/lang-logo.png'){
          fs.unlink(result.rows[0].picture, (err) => {
            if(error)
              res.send(error)
            })
          }

          pool.query(pictureUpdate, (error, resut) => {
            if(error)
              res.send(error)
            res.redirect('/profile' + '?valid=true' + '&field=pic')
          })

        })

    }

  })

  // Similar to the /pictureChoose function, this allows the user to change their username if they wish.
  app.post('/usernameChange', checkLogin, async (req, res) => {

    var checkDatabase = `select * from users where username = '${req.body.uname}'`

    await pool.query(checkDatabase, (error, result) => {
      if(error)
        res.send(error)

      if((result.rows).length){
        res.redirect('/profile' + '?valid=' + false + '&field=uname')
      }
      else {
        var usernameChange = `update users set username = '${req.body.uname}' where id = ${req.session.loggedID}`

        pool.query(usernameChange, (error, result) => {
          if(error)
            res.send(error)

          res.redirect('/profile' + '?valid=' + true)
        })

      }

    })


  })

  //identifies current chat
  var chatID;
  //link to chat page
  app.get('/chat/:chatID', (req,res)=>{
    var uname =req.session.username;
    chatID = req.params.chatID;
    var getmessagesQuery = "SELECT * FROM messages where chatID = " + chatID + "ORDER BY time ASC;"
    + "SELECT * FROM chats WHERE '" + uname +  "'= any(participants);"
    + "SELECT * FROM chats WHERE chatID = " + chatID;

    pool.query(getmessagesQuery, (error,result) => {
      if (error)
        res.end(error);
      var mesData= {'mesInfo':result[0].rows,'chatInfo':result[1].rows, 'username':uname, 'currentchat':result[2].rows[0]}
      res.render('pages/chat',mesData);
    })
  })

  app.post('/chat/create', (req,res)=>{
    var uname = req.session.username;
    let quotemoddedchatname = req.body.chatnameinput.replace(/'/g,"''");
    var makechatQuery = "INSERT INTO chats VALUES (default, '" + quotemoddedchatname + "', ARRAY ['" + uname + "'])";
    var getinfoQuery = " SELECT * FROM chats WHERE name = '" + quotemoddedchatname  + "' ORDER BY chatid DESC";

    pool.query(makechatQuery, (error,unused) => {
      if (error)
        res.end(error);
      pool.query(getinfoQuery, (error,result) => {
        if (error)
          res.end(error);
        let data = {'newchatinfo':result.rows[0] }
        res.render('pages/creategroup', data);
      })
    })
  })

  app.post('/chat/:chatID/leave', (req,res)=>{
    var uname = req.session.username;
    chatID = req.params.chatID;
    var leavechatQuery = "UPDATE chats SET participants = array_remove(participants, '" + uname + "') WHERE chatid = " + chatID;

    pool.query(leavechatQuery, (error,unused) => {
      if (error)
        res.end(error);
      res.render('pages/leavegroup');
    })
  })

  //Socket.IO Messages Setup
  io.on('connection', (socket) => {
    console.log('user connected');
    socket.join(chatID);
    console.log("in chat: " + chatID)

     //temporary ask for username
    socket.on('username', (username)=> {
      socket.username = username;
    });

    socket.on('disconnect', () => {
      console.log('user disconnected');
    });

    socket.on("chat_message", (info)=> {
      //broadcast message to everyone in port:5000 except yourself.
      socket.to(info.chatID).emit("received", {name: socket.username , message: info.msg });
      let quotemoddedmessage = info.msg.replace(/'/g,"''");
      var storemessageQuery = "INSERT INTO messages VALUES (" + info.chatID + ", default, '" + socket.username + "', " + "'" + quotemoddedmessage + "')";
      pool.query(storemessageQuery, (error,result)=> {
      })

      socket.emit("chat_message", {name: socket.username , message: info.msg });
    });

    socket.on("add_participant", (info)=> {
      var addparticipantQuery =  "UPDATE chats SET participants = array_append(participants, '" + info.msg + "') WHERE chatid = " + info.chatID
      pool.query(addparticipantQuery, (error,result)=> {
      })

      var userAddedMessage = socket.username + " added " + info.msg + " to the chat."
      socket.to(info.chatID).emit("received", {name: socket.username , message: userAddedMessage });
      socket.emit("chat_message", {name: socket.username , message: userAddedMessage });

      var storemessageQuery = "INSERT INTO messages VALUES (" + info.chatID + ", default, '" + socket.username + "', " + "'" + userAddedMessage + "')";
      pool.query(storemessageQuery, (error,result)=> {
      })
    })

    socket.on("user_left", (info)=> {
      var userleftMessage = socket.username + " " + info.msg
      socket.to(info.chatID).emit("received", {name: socket.username , message: userleftMessage });
      socket.emit("chat_message", {name: socket.username , message: userleftMessage });

      var storemessageQuery = "INSERT INTO messages VALUES (" + info.chatID + ", default, '" + socket.username + "', " + "'" + userleftMessage + "')";
      pool.query(storemessageQuery, (error,result)=> {
      })
    })
  });

  // Spotify set up

  var SpotifyWebApi = require('spotify-web-api-node');
const { create } = require('domain')

  var scopes = ['user-top-read', 'user-read-currently-playing', 'user-read-recently-played', 'user-library-read']
  var state = 'the_secret'

  var SpotifyAPI = new SpotifyWebApi({
    clientId: '66ad16283b5f40c7a94c0b2af7485926',
    clientSecret: process.env.SPOTIFY_KEY,
    redirectUri: 'http://localhost:5000/spotifyAuth'
  });

  var authorizeURL = SpotifyAPI.createAuthorizeURL(scopes, state)

  app.post('/spotifyTry', checkLogin, (req, res) => {
    res.redirect(authorizeURL)
  })

  app.get('/spotifyAuth', (req, res) => {

    SpotifyAPI.authorizationCodeGrant(req.query.code).then(
      function(data) {
        SpotifyAPI.setAccessToken(data.body['access_token']);
        SpotifyAPI.setRefreshToken(data.body['refresh_token']);
      },
      function(err) {
        res.send(err);
      }
    )
    req.session.Spotify = true;
    res.redirect('/profile')
  })


// Google OAuth 2.0 Setup //

app.get('/google_login', (req,res)=> {
  // Create an OAuth2 client object from the credentials in our config file
  const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
  // Obtain the google login link to which we'll send our users to give us access
  const loginLink = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Indicates that we need to be able to access data continously without the user constantly giving us consent
    scope: CONFIG.oauth2Credentials.scopes // Using the access scopes from our config file
  });
  return res.render("pages/google_login", { loginLink: loginLink });
});

app.get('/auth_callback', function (req, res) {
  // Create an OAuth2 client object from the credentials in our config file
  const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
  if (req.query.error) {
    // The user did not give us permission.
    return res.redirect('/home');
  } else {
    oauth2Client.getToken(req.query.code, function(err, token) {
      if (err)
        return res.redirect('/');

      // Store the credentials given by google into a jsonwebtoken in a cookie called 'jwt'
      res.cookie('jwt', jwt.sign(token, CONFIG.JWTsecret));
      return res.redirect('/mymusic');
    });
  }
});
