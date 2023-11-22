const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const Rule = require('./database/user/rules.model')
require('./db.js')

const app = express();

app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('rules API!!!!');
});


app.post('/rules', (req, res) => {
    const requestData = req.body; // Access the data sent in the POST request

    console.log('Received data:', requestData);
    let rules = new Rule(requestData);

    rules.save().catch(error => console.log(error));

    res.status(200).json({ message: 'Data received successfully' });
  });

app.listen(3000, () => {
    console.log('App listening on port 3000!!');
})

