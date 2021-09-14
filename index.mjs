// index.js
import { spawn } from 'child_process';
import bbPromise from 'bluebird';

(function () {

  function loadProcess(arg) {

    return new bbPromise(function (resolve, reject) {
      const process = spawn('node', ["--experimental-json-modules", "--no-warnings", './mine.mjs', arg]);

      process.stdout.on('data', function (data) {
        console.log(data.toString());
      });

      process.stderr.on('data', function (err) {
        reject(err.toString());
      });

      process.on('exit', function () {
        console.log('Done!');
      });
    });
  }

  const commands = [...Array(16).keys()]
    .map(function (value) {
      return loadProcess.bind(null, value);
    });

  return bbPromise.map(commands, function (command) {
    return command();
  }, {
    concurrency: 16
  })
    .then(function () {
      console.log('Child Processes Completed');
    });
})();
