const axios = require('axios');

const test = () => {
  axios({
    url: 'http://127.0.0.1:3000/5',
    method: 'get',
  }).then((result) => {
    console.log(result.data);
    console.log('___________________________');
  })
    .catch((err) => { console.log(err.response.data); });
};
const multiTest = () => {
  // console.log(Date.now());
  setInterval(test, 500);
};

multiTest();

// test();
// setTimeout(multiTest, 3500);
