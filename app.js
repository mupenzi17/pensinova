const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

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



// create routes
app.get('/', (req, res) => {
  
     // load the index.html file
  res.render('index', { title: 'Home' });
});

app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows)
  } 
  catch (err) {
    console.error(err);
    res.status(500).send('Server error'+ err);
  }
});

app.get('/auth', (req, res) => {
  // render the auth page
  res.render('authentication', { title: 'Authentication' });
});

//404 Not Found route
app.use((req, res, next) => {
  res.status(404).render('404', { title: '404 Not Found' });
});

// start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});