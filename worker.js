const axios = require('axios');

const test = () => {
  axios({
    url: 'http://127.0.0.1:3000/3',
    method: 'get',
  }).then((result) => {
    console.log(result.data);
  })
    .catch((err) => { console.log(err.response.data); });
};
const multiTest = () => {
  setInterval(test, 500);
};

multiTest();

// test();
// setTimeout(multiTest, 3500);
