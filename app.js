const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const multer = require('multer');

const path = require('path');

const storage = multer.diskStorage({
  destination: 'views/uploads/',
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

//Initialize Oauth2 client

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const passport = require('passport');
const session = require('express-session');

// initialize github strategy
const GitHubStrategy = require('passport-github2').Strategy;

// LocalStrategy for password-based authentication
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');


// Import the database connection pool
const pool = require('./db'); 

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('views'));

// set up the view engine
app.set('view engine', 'ejs');
// set the views directory
app.set('views', __dirname + '/views');


//session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// local strategy for password-based authentication
passport.use(new LocalStrategy(async (email, password, done) => {
  try {
    // check if the user exists in the database
    pool.query('SELECT * FROM users WHERE email = $1', [email], (err, result) => {
      if (err) {
        console.error(err);
        return done(err);
      }
      if (result.rows.length === 0) {
        return done(null, false, { message: 'User not found' });
      }
      const user = result.rows[0];
      // compare the password with the hashed password in the database
      const match = bcrypt.compareSync(password, user.password);
      if (!match) {
        return done(null, false, { message: 'Wrong password' });
      }
      return done(null, user);
    });
  }
  catch (err) {
    console.error(err);
    return done(err);
  }
}));



// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user)); // serialize user to the session
passport.deserializeUser((user, done) => done(null, user)); // deserialize user from the session

// Configure Google OAuth strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  // Here you would typically save the user to your database
  console.log('Google profile:', profile);
  // check if the user already exists
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [profile.id]);
  if (user.rows.length > 0) {
    // User exists, you can return the user
    return done(null, user.rows[0]);
  }
  else {
    // User does not exist, you can create a new user
    const newUser = await pool.query('INSERT INTO users (id, first_name, last_name, email, password, photo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', 
      [profile.id, profile.name.givenName, profile.name.familyName, profile.emails[0].value, null, profile.photos[0].value]);
    return done(null, newUser.rows[0]);
  }
  // If the user exists, you can retrieve their information
  // If the user does not exist, you can create a new user in your database
  // For this example, we will just log the profile
  console.log('Google profile:', profile);
  // For this example, we will just return the profile
  return done(null, profile);
}));

// Configure GitHub OAuth strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: '/auth/github/callback'
}, async (accessToken, refreshToken, profile, done) => {
  // Here you would typically save the user to your database
  console.log('GitHub profile:', profile);
  // check if the user already exists
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [profile.id]);
  if (user.rows.length > 0) {
    // User exists, you can return the user
    return done(null, user.rows[0]);
  }
  else {
    // User does not exist, you can create a new user
    const newUser = await pool.query('INSERT INTO users (id, first_name, last_name, email, password, photo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', 
      [profile.id, profile.displayName, null, profile.email, null, profile.photos[0].value]);
    return done(null, newUser.rows[0]);
  }
}));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth');
}



// create routes
app.get('/', (req, res) => {
  
  // check if the user is authenticated
  if (req.isAuthenticated()) {
    return res.redirect('/home');
  }
     // load the index.html file
  res.render('index', { title: 'Home' });
});


app.get('/auth', (req, res) => {

  // check if the user is authenticated
  if (req.isAuthenticated()) {
    return res.redirect('/home');
  }
  // render the auth page
  res.render('authentication', { title: 'Authentication' });
});

app.get('/home', (req, res) => {

  if(!req.isAuthenticated()) {
    return res.redirect('/auth');
  }

  res.render('home', {title: 'Dashboard', user: req.user });
});


// Google OAuth routes
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

app.get('/auth/google/callback',
  passport.authenticate('google', {
    successRedirect: '/home',
    failureRedirect: '/auth'
  })
);

// GitHub OAuth routes
app.get('/auth/github', passport.authenticate('github', {
  scope: ['user:email']
}));
app.get('/auth/github/callback',
  passport.authenticate('github', {
    successRedirect: '/home',
    failureRedirect: '/auth'
  })
);

// Password-based authentication routes
app.post('/auth/login', passport.authenticate('local', {
  successRedirect: '/home',
  failureRedirect: '/auth',
  
}));

// Registration route
app.get('/auth/signup', (req, res) => {
  // check if the user is authenticated
  if (req.isAuthenticated()) {
    return res.redirect('/home');
  }
  // render the registration page
  res.render('register', { title: 'Signup' });
}
);

app.post('/auth/signup', upload.single('photo'), async (req, res) => {
  const { firstname, lastname, email, password, confirm } = req.body;
  // check if the passwords match
  if (password !== confirm) {
    return res.status(400).send('Passwords do not match');
  }
  // check if the user already exists
  const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    return res.status(400).send('User already exists');
  }
  // hash the password
  const hashedPassword = bcrypt.hashSync(password, 10);
  // insert the user into the database
  try {
    const rows = await pool.query('SELECT * FROM users');
    const userCount = rows.rowCount + 1; // Get the current user count
    const userId = `user${userCount}`; // Create a unique user ID
    const newUser = await pool.query('INSERT INTO users (id, first_name, last_name, email, password, photo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', 
      [userId, firstname, lastname, email, hashedPassword, req.file ? `uploads/${req.file.filename}` : null]);
    // log the user in
    req.login(newUser.rows[0], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Login failed');
      }
      res.redirect('/home');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating user');
  }

})

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Logout failed');
    }
    res.redirect('/');
  });
});



//404 Not Found route
app.use((req, res, next) => {
  res.status(404).render('404', { title: '404 Not Found' });
});

// start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});