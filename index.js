const express = require('express');

const port = process.env.PORT || 3000;
const app = express();
const raceLimiter = require('./rateLimiter/rateLimiter');

app.set('trust proxy', true);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/1', raceLimiter.fixWindow(5, 3), (req, res) => {
  const time = Date.now().toString().slice(8, 13);
  res.json({ time, data: '1' });
});

app.get('/2', raceLimiter.slideLog(5, 3), (req, res) => {
  const time = Date.now().toString().slice(8, 13);
  res.json({ time, data: '2' });
});

app.get('/3', raceLimiter.slideWindow(5, 3), (req, res) => {
  const time = Date.now().toString().slice(8, 13);
  res.json({ time, data: '3' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}.`);
});
