var path = require('path');
var util = fis.require('command-server/lib/util.js');
var spawn = require('child_process').spawn;
var fs = require('fs');
var tar = require('tar');

function extract(src, folder, callback) {
  fs
    .createReadStream(src)
    .pipe(tar.Extract({
      path: folder
    }))
    .on('error', function(err) {
      if (callback) {
        callback(err);
      } else {
        fis.log.error('extract tar file [%s] fail, error [%s]', tmp, err);
      }
    })
    .on('end', function() {
      callback && callback(null, src, folder);
    });
}

function checkJavaEnable(opt, callback) {
  var javaVersion = false;
  //check java
  process.stdout.write('checking java support : ');
  var java = spawn('java', ['-version']);

  java.stderr.on('data', function(data) {
    if (!javaVersion) {
      javaVersion = util.matchVersion(data.toString('utf8'));
      if (javaVersion) {
        process.stdout.write('v' + javaVersion + '\n');
      }
    }
  });

  java.on('error', function(err) {
    process.stdout.write('java not support!');
    fis.log.warning(err);
    callback(javaVersion, opt);
  });

  java.on('exit', function() {
    if (!javaVersion) {
      process.stdout.write('java not support!');
    }

    callback(javaVersion, opt);
  });
}

function start(opt, callback) {
  process.stdout.write('starting fis-server .');
  var timeout = Math.max(opt.timeout * 1000, 5000);
  delete opt.timeout;

  var errMsg = 'fis-server fails to start at port [' + opt.port + '], error: ';
  var args = [
    '-Dorg.apache.jasper.compiler.disablejsr199=true',
    //'-Djava.nio.channels.spi.SelectorProvider=sun.nio.ch.PollSelectorProvider',
    '-jar', path.join(__dirname, 'server.jar')
  ];

  var ready = false;
  var log = '';
  var timeoutTimer;

  opt.php_exec = opt.php_exec || 'php-cgi';
  if (!opt.https) {
    delete opt.https;
  }

  fis.util.map(opt, function(key, value) {
    if (~['port', 'root', 'webapp', 'type', 'https'].indexOf(key)) {
      args.push('--' + key, String(value));
    }
  });

  args.push('--base', fis.project.getTempPath());

  var server = spawn('java', args, {
    cwd: __dirname,
    detached: opt.daemon
  });

  server.stderr.on('data', function(chunk) {
    //console.log(chunk.toString('utf8'));
    if (ready) return;
    chunk = chunk.toString('utf8');
    log += chunk;
    process.stdout.write('.');
    if (chunk.indexOf('Starting ProtocolHandler') > 0) {
      ready = true;
      clearTimeout(timeoutTimer);
      process.stdout.write(' at port [' + opt.port + ']\n');

      var protocol = opt.https ? "https" : "http";
      var address = protocol + '://127.0.0.1' + (opt.port == 80 ? '/' : ':' + opt.port + '/');

      fis.log.notice('Browse ' + '%s'.yellow.bold, address);
      fis.log.notice('Or browse ' + '%s'.yellow.bold, protocol + '://' + util.hostname + (opt.port == 80 ? '/' : ':' + opt.port + '/'));

      console.log();

      opt.browse ? util.open(address, function() {
        opt.daemon && process.exit();
      }) : (opt.daemon && process.exit());
    } else if (chunk.indexOf('Exception') > 0) {
      process.stdout.write(' fail\n');
      try {
        process.kill(server.pid, 'SIGKILL');
      } catch (e) {}
      var match = chunk.match(/exception:?\s+([^\r\n]+)/i);
      if (match) {
        errMsg += match[1];
      } else {
        errMsg += 'unknown';
      }
      console.log(log);
      fis.log.error(errMsg);
    }
  });
  server.on('error', function(err) {
    try {
      process.kill(server.pid, 'SIGKILL');
    } catch (e) {}
    fis.log.error(err);
  });

  if (opt.daemon) {
    util.pid(server.pid);
    server.unref();

    timeoutTimer = setTimeout(function() {
      process.stdout.write(' fail\n');
      if (log) console.log(log);
      fis.log.error('timeout');
    }, timeout);
  } else {
    server.stdout.pipe(process.stdout);
    server.stderr.pipe(process.stderr);
  }
}

exports.start = function(opt, callback) {

  // env check.
  checkJavaEnable(opt, function(java) {
    if (java) {

      var done = function() {
        start(opt, callback);
      };

      // 自动初始化运行时框架。
      var markerFile = path.join(opt.root, 'WEB-INF', 'web.xml');
      if (!fis.util.exists(markerFile)) {
        extract(path.join(__dirname, 'framework.tar'), opt.root, done);
      } else {
        setTimeout(done, 200);
      }

    } else {
      callback('`java` is required.');
    }
  });
};

/*exports.clean = function() {

};*/
