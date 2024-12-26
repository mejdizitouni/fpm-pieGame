const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const buildPath = path.join(__dirname, 'build')

app.use(express.static(buildPath))
app.use(express.json())
app.use(cors())

app.post('/pet', (req,res) => {
  const { hasPetted } = req.body;
  if(hasPetted === true) {
    res.json({message: "♡", image: "happypanda"});
  } else {
    res.json({message: "..Why did you stop? T.T", image: "sadpanda"});
  }
})

// gets the static files from the build folder
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'))
})

// Showing that the server is up and running
app.listen(port, () => {
  console.log(`Server is online on port: ${port}`)
})
